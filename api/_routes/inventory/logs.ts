import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '../_lib/db.js';
import { ensureMethod, successResponse, errorResponse, parseBody } from '../_lib/response.js';
import { requireRole } from '../_lib/auth.js';

const VALID_REASONS = ['sale', 'restock', 'return', 'manual_adjustment', 'loss'] as const;
type InventoryReason = typeof VALID_REASONS[number];

const VALID_ADJUSTMENT_TYPES = ['restock', 'customer_return', 'loss_damaged', 'reconciliation'] as const;
type AdjustmentType = typeof VALID_ADJUSTMENT_TYPES[number];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!ensureMethod(req, res, ['GET', 'POST'])) return;

  // Enforce staff/admin authentication
  const user = await requireRole(req, res, ['admin', 'staff']);
  if (!user) return;

  // ─────────────────────────────────────────────────────────────────────────────
  // GET: Fetch inventory logs with joined product details, date filtering, newest first
  // ─────────────────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    try {
      const q = req.query || {};
      const limit = Math.min(Math.max(1, parseInt(String(q.limit || '500'), 10) || 500), 1000);

      const fromStr = q.from ? String(q.from).trim() : null;
      const toStr = q.to ? String(q.to).trim() : null;
      const reasonStr = q.reason ? String(q.reason).trim() : null;

      let prodId: number | null = null;
      if (q.product_id) {
        const parsed = parseInt(String(q.product_id), 10);
        if (Number.isFinite(parsed) && parsed > 0) {
          prodId = parsed;
        }
      }

      const rows = await sql`
        SELECT 
          l.id,
          l.product_id,
          l.old_quantity::float AS old_quantity,
          l.new_quantity::float AS new_quantity,
          l.adjustment::float AS adjustment,
          l.reason,
          l.adjustment_type,
          l.note,
          l.reference_id,
          l.created_by,
          l.created_at,
          o.invoice_no AS order_invoice_no,
          json_build_object(
            'name', COALESCE(p.name, '—'),
            'category', COALESCE(p.category, '—')
          ) AS products
        FROM public.inventory_logs l
        LEFT JOIN public.products p ON l.product_id = p.id
        LEFT JOIN public.orders o ON (
          l.reference_id IS NOT NULL AND (
            l.reference_id = o.id::text OR 
            l.reference_id = o.invoice_no
          )
        )
        WHERE
          (${fromStr}::timestamptz IS NULL OR l.created_at >= ${fromStr}::timestamptz)
          AND (${toStr}::timestamptz IS NULL OR l.created_at <= ${toStr}::timestamptz)
          AND (${prodId}::bigint IS NULL OR l.product_id = ${prodId}::bigint)
          AND (${reasonStr}::text IS NULL OR l.reason = ${reasonStr}::text)
        ORDER BY l.created_at DESC
        LIMIT ${limit}
      `;

      return successResponse(res, rows);
    } catch (err: any) {
      console.error('Error fetching inventory logs:', err);
      return errorResponse(res, 'Failed to fetch inventory logs.', 500, {
        message: err.message,
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // POST: Insert inventory audit log entry (manual adjustment, restock, loss, etc.)
  // ─────────────────────────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    try {
      const b = parseBody(req);

      const rawProdId = b.product_id ?? b.productId;
      const prodId = parseInt(String(rawProdId), 10);
      if (!Number.isFinite(prodId) || prodId <= 0) {
        return errorResponse(res, 'Valid product_id is required.', 400);
      }

      // Verify product exists
      const prodCheck = await sql`
        SELECT id, name, category, stock_quantity 
        FROM public.products 
        WHERE id = ${prodId} 
        LIMIT 1
      `;
      if (!prodCheck || prodCheck.length === 0) {
        return errorResponse(res, `Product with ID ${prodId} does not exist.`, 404);
      }
      const productRow = prodCheck[0];

      const oldQty = Number(b.old_quantity ?? b.oldQuantity ?? productRow.stock_quantity);
      const newQty = Number(b.new_quantity ?? b.newQuantity);

      if (!Number.isFinite(oldQty) || oldQty < 0) {
        return errorResponse(res, 'old_quantity must be a valid non-negative number.', 400);
      }
      if (!Number.isFinite(newQty) || newQty < 0) {
        return errorResponse(res, 'new_quantity must be a valid non-negative number.', 400);
      }

      const rawAdjustment = b.adjustment !== undefined ? Number(b.adjustment) : (newQty - oldQty);
      if (!Number.isFinite(rawAdjustment)) {
        return errorResponse(res, 'adjustment must be a valid finite number.', 400);
      }

      const reason = String(b.reason || '').trim().toLowerCase() as InventoryReason;
      if (!VALID_REASONS.includes(reason)) {
        return errorResponse(res, `Invalid reason "${b.reason}". Allowed: ${VALID_REASONS.join(', ')}`, 400);
      }

      // New typed adjustment_type field (optional, for structured reporting)
      const rawAdjType = b.adjustment_type !== undefined ? String(b.adjustment_type).trim().toLowerCase() : null;
      const adjustmentType: AdjustmentType | null = rawAdjType && VALID_ADJUSTMENT_TYPES.includes(rawAdjType as AdjustmentType)
        ? (rawAdjType as AdjustmentType)
        : null;

      // Dedicated note field (separate from reference_id)
      const noteText = b.note !== undefined && b.note !== null && String(b.note).trim() !== ''
        ? String(b.note).trim().slice(0, 500)
        : null;

      const referenceId = b.reference_id !== undefined && b.reference_id !== null && b.reference_id !== ''
        ? String(b.reference_id).trim().slice(0, 255)
        : (b.referenceId !== undefined && b.referenceId !== null && b.referenceId !== '' ? String(b.referenceId).trim().slice(0, 255) : null);

      const inserted = await sql`
        INSERT INTO public.inventory_logs (
          product_id,
          old_quantity,
          new_quantity,
          adjustment,
          reason,
          adjustment_type,
          note,
          reference_id,
          created_by
        ) VALUES (
          ${prodId},
          ${oldQty},
          ${newQty},
          ${rawAdjustment},
          ${reason},
          ${adjustmentType},
          ${noteText},
          ${referenceId},
          ${user.id}
        )
        RETURNING
          id,
          product_id,
          old_quantity::float AS old_quantity,
          new_quantity::float AS new_quantity,
          adjustment::float AS adjustment,
          reason,
          adjustment_type,
          note,
          reference_id,
          created_by,
          created_at
      `;

      const result = {
        ...inserted[0],
        products: {
          name: productRow.name || '—',
          category: productRow.category || '—',
        },
      };

      return successResponse(res, result, 201, 'Inventory log recorded successfully.');
    } catch (err: any) {
      console.error('Error inserting inventory log:', err);
      return errorResponse(res, 'Failed to record inventory log.', 500, {
        message: err.message,
      });
    }
  }
}
