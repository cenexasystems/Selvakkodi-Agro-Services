import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '../_lib/db.js';
import { ensureMethod, successResponse, errorResponse } from '../_lib/response.js';
import { requireAuth } from '../_lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!ensureMethod(req, res, ['POST'])) return;

  const user = await requireAuth(req, res);
  if (!user) return;

  try {
    if (user.role === 'admin' || user.role === 'staff') {
      await sql`
        UPDATE public.notifications
        SET is_read = TRUE
        WHERE 
          is_read = FALSE
          AND (
            user_id = ${user.id}
            OR role_target = ${user.role}
            OR role_target = 'admin'
            OR role_target = 'staff'
            OR role_target = 'all'
            OR role_target IS NULL
          )
      `;
    } else {
      await sql`
        UPDATE public.notifications
        SET is_read = TRUE
        WHERE user_id = ${user.id} AND is_read = FALSE
      `;
    }

    return successResponse(res, { markedAll: true }, 200, 'All notifications marked as read.');
  } catch (err: any) {
    console.error('Error marking all notifications read:', err);
    return errorResponse(res, 'Failed to mark notifications as read.', 500, {
      message: err.message,
    });
  }
}
