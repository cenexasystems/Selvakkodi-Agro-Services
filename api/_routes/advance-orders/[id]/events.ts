import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '../../_lib/db.js';
import { ensureMethod, successResponse, errorResponse, parseBody } from '../../_lib/response.js';
import { requireRole } from '../../_lib/auth.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!ensureMethod(req, res, ['POST'])) return;

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
    const eventType = String(b.eventType || b.event_type || '').trim();
    const label = String(b.label || '').trim();
    const remarks = String(b.remarks || '').trim();

    if (!eventType) {
      return errorResponse(res, 'Event type is required.', 400);
    }
    if (!label) {
      return errorResponse(res, 'Label is required.', 400);
    }

    const validUserId = user.id && UUID_REGEX.test(String(user.id)) ? String(user.id) : null;

    await sql`
      SELECT public.add_advance_order_event(
        ${targetId}::uuid,
        ${eventType},
        ${label},
        ${remarks},
        ${validUserId}::uuid
      )
    `;

    return successResponse(res, { message: 'Timeline event added successfully.' }, 201);
  } catch (err: any) {
    console.error('Error adding advance order event:', err);
    return errorResponse(res, err.message || 'Failed to add timeline event.', 500);
  }
}
