import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '../../_lib/db.js';
import { ensureMethod, successResponse, errorResponse } from '../../_lib/response.js';
import { getAuthenticatedUser, requireRole } from '../../_lib/auth.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!ensureMethod(req, res, ['GET'])) return;

  const user = await getAuthenticatedUser(req);
  if (!user) {
    return errorResponse(res, 'Authentication required. Please log in.', 401);
  }

  const idParam = String(req.query.id || '').trim();
  if (!idParam) {
    return errorResponse(res, 'Advance order ID is required.', 400);
  }

  try {
    const isUuid = UUID_REGEX.test(idParam);
    let targetId = idParam;
    let orderRow = null;
    if (!isUuid) {
      const lookup = await sql`SELECT id, created_by, phone FROM public.advance_orders WHERE deposit_id = ${idParam} LIMIT 1`;
      if (!lookup || lookup.length === 0) return errorResponse(res, 'Advance order not found.', 404);
      targetId = lookup[0].id;
      orderRow = lookup[0];
    } else {
      const lookup = await sql`SELECT id, created_by, phone FROM public.advance_orders WHERE id = ${idParam}::uuid LIMIT 1`;
      if (!lookup || lookup.length === 0) return errorResponse(res, 'Advance order not found.', 404);
      targetId = lookup[0].id;
      orderRow = lookup[0];
    }

    const isStaffOrAdmin = user.role === 'admin' || user.role === 'staff';
    const cleanUserMobile = user.mobile ? user.mobile.replace(/\D/g, '') : '';
    const cleanOrderPhone = orderRow.phone ? orderRow.phone.replace(/\D/g, '') : '';
    const isCustomerOwner = user.role === 'customer' && (
      (orderRow.created_by && String(orderRow.created_by) === String(user.id)) ||
      (cleanUserMobile && cleanOrderPhone && cleanUserMobile === cleanOrderPhone)
    );

    if (!isStaffOrAdmin && !isCustomerOwner) {
      return errorResponse(res, 'Unauthorized to view history for this advance order.', 403);
    }

    const [timeline, payments] = await Promise.all([
      sql`
        SELECT id, advance_order_id, event_type, label, remarks, created_by, created_at
        FROM public.advance_order_timeline
        WHERE advance_order_id = ${targetId}::uuid
        ORDER BY created_at ASC
      `,
      sql`
        SELECT id, advance_order_id, payment_type, amount, payment_method, remarks, received_by, received_at
        FROM public.advance_order_payments
        WHERE advance_order_id = ${targetId}::uuid
        ORDER BY received_at ASC
      `
    ]);

    return successResponse(res, {
      timeline: timeline || [],
      payments: payments || [],
    });
  } catch (err: any) {
    console.error('Error fetching advance order history:', err);
    return errorResponse(res, 'Failed to fetch advance order history.', 500, { message: err.message });
  }
}
