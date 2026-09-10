import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '../../_lib/db.js';
import { ensureMethod, successResponse, errorResponse, parseBody } from '../../_lib/response.js';
import { requireRole } from '../../_lib/auth.js';

const ALLOWED_STATUSES = new Set([
  'pending',
  'processing',
  'completed',
  'cancelled',
  'refunded',
  'delivered',
]);

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!ensureMethod(req, res, ['PUT'])) return;

  const user = await requireRole(req, res, ['admin', 'staff']);
  if (!user) return;

  const idParam = String(req.query.id || '').trim();
  if (!idParam) {
    return errorResponse(res, 'Order ID is required.', 400);
  }

  const b = parseBody(req);
  const newStatus = String(b.status || '').trim().toLowerCase();

  if (!ALLOWED_STATUSES.has(newStatus)) {
    return errorResponse(
      res,
      `Invalid status "${newStatus}". Allowed values: ${Array.from(ALLOWED_STATUSES).join(', ')}`,
      400
    );
  }

  try {
    const isUuid = UUID_REGEX.test(idParam);
    let targetId = idParam;

    if (!isUuid) {
      const lookup = await sql`SELECT id FROM public.orders WHERE invoice_no = ${idParam} LIMIT 1`;
      if (!lookup || lookup.length === 0) return errorResponse(res, 'Order not found.', 404);
      targetId = lookup[0].id;
    }

    // Updating status to 'completed' will invoke trigger_order_inventory_deduction.
    // If stock is insufficient, the trigger raises an exception which rolls back the transaction.
    // If stock was already deducted (stock_deducted = TRUE), the trigger safely returns NEW without duplicate deduction.
    await sql`
      UPDATE public.orders
      SET 
        status = ${newStatus},
        updated_at = NOW()
      WHERE id = ${targetId}::uuid
    `;

    const updatedRows = await sql`
      SELECT id, invoice_no, status, stock_deducted, updated_at
      FROM public.orders
      WHERE id = ${targetId}::uuid
      LIMIT 1
    `;

    if (!updatedRows || updatedRows.length === 0) {
      return errorResponse(res, 'Order not found.', 404);
    }

    return successResponse(res, updatedRows[0], 200, `Order status updated to ${newStatus}.`);
  } catch (err: any) {
    console.error('Error updating order status:', err);
    const msg = String(err.message || err);
    if (/insufficient stock/i.test(msg)) {
      return errorResponse(res, msg, 409, { code: 'INSUFFICIENT_STOCK' });
    }
    return errorResponse(res, 'Failed to update order status.', 500, { message: msg });
  }
}
