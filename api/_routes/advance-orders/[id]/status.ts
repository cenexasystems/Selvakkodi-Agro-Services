import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '../../_lib/db.js';
import { ensureMethod, successResponse, errorResponse, parseBody } from '../../_lib/response.js';
import { requireRole } from '../../_lib/auth.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VALID_STATUSES = [
  'pending_deposit',
  'ready_for_delivery',
  'waiting_final_payment',
  'completed',
  'cancelled'
];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!ensureMethod(req, res, ['PUT', 'PATCH'])) return;

  const user = await requireRole(req, res, ['admin', 'staff']);
  if (!user) return;

  const idParam = String(req.query.id || '').trim();
  if (!idParam) {
    return errorResponse(res, 'Advance order ID is required.', 400);
  }

  try {
    const isUuid = UUID_REGEX.test(idParam);
    let targetId = idParam;
    if (!isUuid) {
      const lookup = await sql`SELECT id FROM public.advance_orders WHERE deposit_id = ${idParam} LIMIT 1`;
      if (!lookup || lookup.length === 0) return errorResponse(res, 'Advance order not found.', 404);
      targetId = lookup[0].id;
    }

    const b = parseBody(req);
    const status = String(b.status || '').trim();
    const remarks = String(b.remarks || '').trim();

    if (!status) {
      return errorResponse(res, 'Status is required.', 400);
    }
    if (!VALID_STATUSES.includes(status)) {
      return errorResponse(res, `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`, 400);
    }

    const validUserId = user.id && UUID_REGEX.test(String(user.id)) ? String(user.id) : null;

    const result = await sql`
      SELECT * FROM public.update_advance_order_status(
        ${targetId}::uuid,
        ${status},
        ${remarks},
        ${validUserId}::uuid
      )
    `;

    if (!result || result.length === 0) {
      return errorResponse(res, 'Failed to update advance order status.', 500);
    }

    return successResponse(res, result[0], 200, `Advance order status updated to ${status}.`);
  } catch (err: any) {
    console.error('Error updating advance order status:', err);
    return errorResponse(res, err.message || 'Failed to update status.', 500);
  }
}
