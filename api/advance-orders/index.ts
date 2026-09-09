import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '../_lib/db.js';
import { ensureMethod, successResponse, errorResponse, parseBody } from '../_lib/response.js';
import { requireRole } from '../_lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!ensureMethod(req, res, ['GET', 'POST'])) return;

  // ─────────────────────────────────────────────────────────────────────────────
  // GET: List/Search Advance Orders (Admin / Staff)
  // ─────────────────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const user = await requireRole(req, res, ['admin', 'staff']);
    if (!user) return;

    try {
      const q = req.query || {};
      const limit = Math.min(Math.max(1, parseInt(String(q.limit || '500'), 10) || 500), 1000);
      const offset = Math.max(0, parseInt(String(q.offset || '0'), 10) || 0);

      const status = q.status ? String(q.status).trim() : null;
      const search = q.search ? String(q.search).trim() : null;

      let orders;
      if (search && status && status !== 'all') {
        const pattern = `%${search}%`;
        orders = await sql`
          SELECT *
          FROM public.advance_orders
          WHERE status = ${status}
            AND (
              deposit_id ILIKE ${pattern}
              OR customer_name ILIKE ${pattern}
              OR phone ILIKE ${pattern}
              OR product_name ILIKE ${pattern}
              OR COALESCE(reference_number, '') ILIKE ${pattern}
            )
          ORDER BY created_at DESC
          LIMIT ${limit} OFFSET ${offset}
        `;
      } else if (search) {
        const pattern = `%${search}%`;
        orders = await sql`
          SELECT *
          FROM public.advance_orders
          WHERE deposit_id ILIKE ${pattern}
             OR customer_name ILIKE ${pattern}
             OR phone ILIKE ${pattern}
             OR product_name ILIKE ${pattern}
             OR COALESCE(reference_number, '') ILIKE ${pattern}
          ORDER BY created_at DESC
          LIMIT ${limit} OFFSET ${offset}
        `;
      } else if (status && status !== 'all') {
        orders = await sql`
          SELECT *
          FROM public.advance_orders
          WHERE status = ${status}
          ORDER BY created_at DESC
          LIMIT ${limit} OFFSET ${offset}
        `;
      } else {
        orders = await sql`
          SELECT *
          FROM public.advance_orders
          ORDER BY created_at DESC
          LIMIT ${limit} OFFSET ${offset}
        `;
      }

      return successResponse(res, orders || []);
    } catch (err: any) {
      console.error('Error listing advance orders:', err);
      return errorResponse(res, 'Failed to fetch advance orders.', 500, { message: err.message });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // POST: Create Advance Order (Admin / Staff)
  // ─────────────────────────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const user = await requireRole(req, res, ['admin', 'staff']);
    if (!user) return;

    try {
      const b = parseBody(req);

      const customerName = String(b.customerName || b.customer_name || '').trim();
      const phone = String(b.phone || '').trim();
      const address = String(b.address || '').trim();
      const productName = String(b.productName || b.product_name || '').trim();
      const category = String(b.category || '').trim();
      const description = String(b.description || '').trim();
      const totalAmount = Number(b.totalAmount ?? b.total_amount);
      const depositAmount = Number(b.depositAmount ?? b.deposit_amount);
      const expectedDeliveryDate = String(b.expectedDeliveryDate || b.expected_delivery_date || '').trim();
      const remarks = String(b.remarks || '').trim();
      const referenceNumber = String(b.referenceNumber || b.reference_number || '').trim();
      const paymentMethod = String(b.paymentMethod || b.payment_method || 'cash').trim().toLowerCase();
      const createdByName = String(b.createdByName || b.created_by_name || user.name || 'Staff').trim();
      const products = Array.isArray(b.products) && b.products.length > 0
        ? b.products
        : [{
            name: productName,
            category: category,
            description: description,
            quantity: 1,
            base_price: totalAmount,
            line_total: totalAmount,
            unit: 'piece',
            unit_type: 'unit',
            source: 'advance_order'
          }];

      if (!customerName) return errorResponse(res, 'Customer name is required.', 400);
      if (!phone) return errorResponse(res, 'Phone number is required.', 400);
      if (!productName) return errorResponse(res, 'Product name is required.', 400);
      if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
        return errorResponse(res, 'Total amount must be greater than zero.', 400);
      }
      if (!Number.isFinite(depositAmount) || depositAmount <= 0 || depositAmount >= totalAmount) {
        return errorResponse(res, 'Deposit amount must be greater than zero and less than the total amount.', 400);
      }
      if (!expectedDeliveryDate) {
        return errorResponse(res, 'Expected delivery date is required.', 400);
      }

      // Check if user.id is a valid UUID, otherwise pass NULL
      const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const validUserId = user.id && UUID_REGEX.test(String(user.id)) ? String(user.id) : null;

      const result = await sql`
        SELECT * FROM public.create_advance_order(
          ${customerName},
          ${phone},
          ${address},
          ${productName},
          ${category},
          ${description},
          ${totalAmount},
          ${depositAmount},
          ${expectedDeliveryDate}::date,
          ${remarks},
          ${paymentMethod},
          ${createdByName},
          ${JSON.stringify(products)}::jsonb,
          ${validUserId}::uuid,
          ${referenceNumber}
        )
      `;

      if (!result || result.length === 0) {
        return errorResponse(res, 'Failed to create advance order.', 500);
      }

      return successResponse(res, result[0], 201, 'Advance order created successfully.');
    } catch (err: any) {
      console.error('Error creating advance order:', err);
      return errorResponse(res, err.message || 'Failed to create advance order.', 500);
    }
  }
}
