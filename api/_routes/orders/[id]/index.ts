import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '../../_lib/db.js';
import { ensureMethod, successResponse, errorResponse, parseBody } from '../../_lib/response.js';
import { getAuthenticatedUser, requireRole } from '../../_lib/auth.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function findOrder(idParam: string) {
  const isUuid = UUID_REGEX.test(idParam);
  if (isUuid) {
    const rows = await sql`SELECT * FROM public.orders WHERE id = ${idParam}::uuid LIMIT 1`;
    if (rows && rows.length > 0) return rows[0];
  }

  const cleanNum = idParam.replace(/^[#\s]*inv[-_\s]*/i, '').trim();
  const digitsOnly = idParam.replace(/\D/g, '');

  const rows = await sql`
    SELECT * FROM public.orders 
    WHERE invoice_no = ${idParam}
       OR invoice_no = ${cleanNum}
       OR (length(${digitsOnly}) > 0 AND invoice_no = ${digitsOnly})
       OR invoice_no ILIKE ${cleanNum}
       OR ('INV' || invoice_no) ILIKE ${idParam}
       OR invoice_no ILIKE ${'%' + cleanNum + '%'}
       OR invoice_no ILIKE ${'%' + idParam + '%'}
    LIMIT 1
  `;
  return rows && rows.length > 0 ? rows[0] : null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!ensureMethod(req, res, ['GET', 'PUT', 'DELETE'])) return;

  const idParam = String(req.query.id || '').trim();
  if (!idParam) {
    return errorResponse(res, 'Order ID or invoice number is required.', 400);
  }

  const isUuid = UUID_REGEX.test(idParam);

  // ─────────────────────────────────────────────────────────────────────────────
  // GET: Order Detail / Digital Invoice Lookup
  // ─────────────────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    try {
      const order = await findOrder(idParam);

      if (!order) {
        return errorResponse(res, 'Order not found.', 404);
      }

      const authUser = await getAuthenticatedUser(req);

      // Authorization checks:
      // 1. Admin or Staff: full access
      const isStaffOrAdmin = authUser && (authUser.role === 'admin' || authUser.role === 'staff');
      // 2. Customer: own order access
      const isCustomerOwner = authUser && (
        (order.user_id && order.user_id === authUser.id) ||
        (authUser.mobile && order.phone && order.phone.replace(/\D/g, '') === authUser.mobile.replace(/\D/g, ''))
      );
      // 3. Public access: allowed for digital invoice lookup (when requested by invoice number or public link)
      const isInvoiceLookup = req.query.public === 'true' || req.query.public === '1' || !isUuid || !authUser;

      if (!isStaffOrAdmin && !isCustomerOwner && !isInvoiceLookup) {
        return errorResponse(res, 'Unauthorized to view this order.', 403);
      }

      // Fetch order items
      const items = await sql`
        SELECT 
          id, order_id, product_id, variant_id, product_name, name,
          tamil_name, variant_name, quantity, unit, unit_type,
          base_price, unit_price, line_total, image_url, is_manual,
          source, note, gst_rate, gst_amount, created_at
        FROM public.order_items
        WHERE order_id = ${order.id}
        ORDER BY id ASC
      `;

      return successResponse(res, {
        ...order,
        order_items: items,
      });
    } catch (err: any) {
      console.error('Error fetching order:', err);
      return errorResponse(res, 'Failed to fetch order details.', 500, { message: err.message });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PUT: Update Order Metadata (Admin / Staff)
  // ─────────────────────────────────────────────────────────────────────────────
  if (req.method === 'PUT') {
    const user = await requireRole(req, res, ['admin', 'staff']);
    if (!user) return;

    try {
      const b = parseBody(req);

      const existing = await findOrder(idParam);
      if (!existing) return errorResponse(res, 'Order not found.', 404);
      const targetId = existing.id;

      const remarks = b.remarks !== undefined ? String(b.remarks) : null;
      const referenceNumber = b.referenceNumber ?? b.reference_number;
      const customerName = b.customerName ?? b.customer_name;
      const phone = b.phone;
      const address = b.address;
      let billingDate: string | null = null;
      const rawBillingDate = b.billingDate ?? b.billing_date;
      if (rawBillingDate && String(rawBillingDate).trim()) {
        const trimmedDate = String(rawBillingDate).trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(trimmedDate)) {
          const [y, m, d] = trimmedDate.split('-').map(Number);
          const now = new Date();
          billingDate = new Date(y, m - 1, d, now.getHours(), now.getMinutes(), now.getSeconds()).toISOString();
        } else {
          const parsed = new Date(trimmedDate);
          billingDate = isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
        }
      }
      const paymentMode = b.paymentMode ?? b.payment_mode ?? b.paymentMethod ?? b.payment_method;

      await sql`
        UPDATE public.orders
        SET
          remarks = COALESCE(${remarks}, remarks),
          reference_number = COALESCE(${referenceNumber ? String(referenceNumber) : null}, reference_number),
          customer_name = COALESCE(${customerName ? String(customerName) : null}, customer_name),
          phone = COALESCE(${phone ? String(phone) : null}, phone),
          address = COALESCE(${address ? String(address) : null}, address),
          billing_date = COALESCE(${billingDate}::timestamptz, billing_date),
          payment_mode = COALESCE(${paymentMode ? String(paymentMode) : null}, payment_mode),
          payment_method = COALESCE(${paymentMode ? String(paymentMode) : null}, payment_method),
          updated_at = NOW()
        WHERE id = ${targetId}::uuid
      `;

      const updated = await sql`SELECT * FROM public.orders WHERE id = ${targetId}::uuid LIMIT 1`;
      return successResponse(res, updated[0], 200, 'Order updated successfully.');
    } catch (err: any) {
      console.error('Error updating order:', err);
      return errorResponse(res, 'Failed to update order.', 500, { message: err.message });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // DELETE: Delete Order (Admin / Staff)
  // ─────────────────────────────────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    const user = await requireRole(req, res, ['admin', 'staff']);
    if (!user) return;

    try {
      const existing = await findOrder(idParam);
      if (!existing) return errorResponse(res, 'Order not found.', 404);
      const targetId = existing.id;

      // Disassociate from any advance orders to avoid foreign key restriction
      await sql`
        UPDATE public.advance_orders
        SET completed_order_id = NULL
        WHERE completed_order_id = ${targetId}::uuid
      `;

      // Deleting order cascades to order_items
      await sql`DELETE FROM public.orders WHERE id = ${targetId}::uuid`;

      return successResponse(res, { message: `Order ${idParam} deleted successfully.` });
    } catch (err: any) {
      console.error('Error deleting order:', err);
      return errorResponse(res, 'Failed to delete order.', 500, { message: err.message });
    }
  }
}
