import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '../../_lib/db.js';
import { ensureMethod, successResponse, errorResponse, parseBody } from '../../_lib/response.js';
import { getAuthenticatedUser, requireRole } from '../../_lib/auth.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!ensureMethod(req, res, ['GET', 'PUT', 'DELETE'])) return;

  const idParam = String(req.query.id || '').trim();
  if (!idParam) {
    return errorResponse(res, 'Advance order ID or deposit ID is required.', 400);
  }

  const isUuid = UUID_REGEX.test(idParam);

  // ─────────────────────────────────────────────────────────────────────────────
  // GET: Single Advance Order (Admin / Staff / Customer Owner)
  // ─────────────────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return errorResponse(res, 'Authentication required. Please log in.', 401);
    }

    try {
      let orders;
      if (isUuid) {
        orders = await sql`SELECT * FROM public.advance_orders WHERE id = ${idParam}::uuid LIMIT 1`;
      } else {
        orders = await sql`
          SELECT * FROM public.advance_orders 
          WHERE deposit_id = ${idParam} 
             OR deposit_id ILIKE ${'%' + idParam}
          LIMIT 1
        `;
      }

      if (!orders || orders.length === 0) {
        return errorResponse(res, 'Advance order not found.', 404);
      }

      const order = orders[0];
      const isStaffOrAdmin = user.role === 'admin' || user.role === 'staff';
      const cleanUserMobile = user.mobile ? user.mobile.replace(/\D/g, '') : '';
      const cleanOrderPhone = order.phone ? order.phone.replace(/\D/g, '') : '';
      const isCustomerOwner = user.role === 'customer' && (
        (order.created_by && String(order.created_by) === String(user.id)) ||
        (cleanUserMobile && cleanOrderPhone && cleanUserMobile === cleanOrderPhone)
      );

      if (!isStaffOrAdmin && !isCustomerOwner) {
        return errorResponse(res, 'Unauthorized to view this advance order.', 403);
      }

      return successResponse(res, order);
    } catch (err: any) {
      console.error('Error fetching advance order:', err);
      return errorResponse(res, 'Failed to fetch advance order.', 500, { message: err.message });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PUT: Update Advance Order Details (Admin / Staff)
  // ─────────────────────────────────────────────────────────────────────────────
  if (req.method === 'PUT') {
    const user = await requireRole(req, res, ['admin', 'staff']);
    if (!user) return;

    try {
      const b = parseBody(req);

      let targetId = idParam;
      if (!isUuid) {
        const lookup = await sql`SELECT id FROM public.advance_orders WHERE deposit_id = ${idParam} LIMIT 1`;
        if (!lookup || lookup.length === 0) return errorResponse(res, 'Advance order not found.', 404);
        targetId = lookup[0].id;
      }

      const remarks = b.remarks !== undefined ? String(b.remarks) : null;
      const referenceNumber = b.referenceNumber ?? b.reference_number;
      const customerName = b.customerName ?? b.customer_name;
      const phone = b.phone;
      const address = b.address;
      const expectedDeliveryDate = b.expectedDeliveryDate ?? b.expected_delivery_date;

      await sql`
        UPDATE public.advance_orders
        SET
          remarks = COALESCE(${remarks}, remarks),
          reference_number = COALESCE(${referenceNumber !== undefined ? String(referenceNumber) : null}, reference_number),
          customer_name = COALESCE(${customerName ? String(customerName) : null}, customer_name),
          phone = COALESCE(${phone ? String(phone) : null}, phone),
          address = COALESCE(${address ? String(address) : null}, address),
          expected_delivery_date = COALESCE(${expectedDeliveryDate ? String(expectedDeliveryDate) : null}::date, expected_delivery_date),
          updated_at = NOW()
        WHERE id = ${targetId}::uuid
      `;

      const updated = await sql`SELECT * FROM public.advance_orders WHERE id = ${targetId}::uuid LIMIT 1`;
      return successResponse(res, updated[0], 200, 'Advance order updated successfully.');
    } catch (err: any) {
      console.error('Error updating advance order:', err);
      return errorResponse(res, 'Failed to update advance order.', 500, { message: err.message });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // DELETE: Delete Advance Order (Admin)
  // ─────────────────────────────────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    const user = await requireRole(req, res, ['admin']);
    if (!user) return;

    try {
      let targetId = idParam;
      if (!isUuid) {
        const lookup = await sql`SELECT id FROM public.advance_orders WHERE deposit_id = ${idParam} LIMIT 1`;
        if (!lookup || lookup.length === 0) return errorResponse(res, 'Advance order not found.', 404);
        targetId = lookup[0].id;
      }

      // Delete payments & timeline events first
      await sql`DELETE FROM public.advance_order_payments WHERE advance_order_id = ${targetId}::uuid`;
      await sql`DELETE FROM public.advance_order_timeline WHERE advance_order_id = ${targetId}::uuid`;
      await sql`DELETE FROM public.advance_orders WHERE id = ${targetId}::uuid`;

      return successResponse(res, { message: `Advance order ${idParam} deleted successfully.` });
    } catch (err: any) {
      console.error('Error deleting advance order:', err);
      return errorResponse(res, 'Failed to delete advance order.', 500, { message: err.message });
    }
  }
}
