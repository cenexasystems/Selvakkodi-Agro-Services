import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '../_lib/db.js';
import { ensureMethod, successResponse, errorResponse, parseBody } from '../_lib/response.js';
import { requireAuth } from '../_lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!ensureMethod(req, res, ['PATCH', 'DELETE'])) return;

  const user = await requireAuth(req, res);
  if (!user) return;

  const { id } = req.query;
  const targetId = String(id || '').trim();
  if (!targetId || targetId.length < 10) {
    return errorResponse(res, 'Invalid notification ID.', 400);
  }

  // Check notification existence and permission
  const existing = await sql`
    SELECT id, user_id, role_target, is_read
    FROM public.notifications
    WHERE id = ${targetId}::UUID
    LIMIT 1
  `;

  if (!existing || existing.length === 0) {
    return errorResponse(res, 'Notification not found.', 404);
  }

  const notif = existing[0];

  // Authorization check: user must own the notification or have matching staff/admin role
  const canAccess =
    user.role === 'admin' ||
    notif.user_id === user.id ||
    (user.role === 'staff' && (notif.role_target === 'staff' || notif.role_target === 'all'));

  if (!canAccess) {
    return errorResponse(res, 'Forbidden. You cannot modify this notification.', 403);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PATCH: Mark notification as read or update is_read status
  // ─────────────────────────────────────────────────────────────────────────────
  if (req.method === 'PATCH') {
    try {
      const b = parseBody<{ is_read?: boolean }>(req);
      const isRead = b.is_read !== undefined ? Boolean(b.is_read) : true;

      const rows = await sql`
        UPDATE public.notifications
        SET is_read = ${isRead}
        WHERE id = ${targetId}::UUID
        RETURNING id, user_id, role_target, type, title, message, is_read, created_at
      `;

      return successResponse(res, rows[0], 200, 'Notification updated.');
    } catch (err: any) {
      console.error('Error updating notification:', err);
      return errorResponse(res, 'Failed to update notification.', 500, {
        message: err.message,
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // DELETE: Delete notification
  // ─────────────────────────────────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    try {
      await sql`
        DELETE FROM public.notifications
        WHERE id = ${targetId}::UUID
      `;

      return successResponse(res, { id: targetId }, 200, 'Notification deleted.');
    } catch (err: any) {
      console.error('Error deleting notification:', err);
      return errorResponse(res, 'Failed to delete notification.', 500, {
        message: err.message,
      });
    }
  }
}
