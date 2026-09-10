import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '../_lib/db.js';
import { ensureMethod, successResponse, errorResponse, parseBody } from '../_lib/response.js';
import { requireAuth } from '../_lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!ensureMethod(req, res, ['GET', 'POST'])) return;

  const user = await requireAuth(req, res);
  if (!user) return;

  // ─────────────────────────────────────────────────────────────────────────────
  // GET: Fetch notifications with strict role & ownership segregation
  // ─────────────────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    try {
      let rows;
      if (user.role === 'admin' || user.role === 'staff') {
        rows = await sql`
          SELECT id, user_id, role_target, type, title, message, data, is_read, created_at
          FROM public.notifications
          WHERE 
            user_id = ${user.id}
            OR role_target = ${user.role}
            OR role_target = 'admin'
            OR role_target = 'staff'
            OR role_target = 'all'
            OR role_target IS NULL
          ORDER BY created_at DESC
          LIMIT 50
        `;
      } else {
        // Customer can strictly only view notifications directly addressed to their account
        rows = await sql`
          SELECT id, user_id, role_target, type, title, message, data, is_read, created_at
          FROM public.notifications
          WHERE user_id = ${user.id}
          ORDER BY created_at DESC
          LIMIT 50
        `;
      }

      return successResponse(res, rows);
    } catch (err: any) {
      console.error('Error fetching notifications:', err);
      return errorResponse(res, 'Failed to fetch notifications.', 500, {
        message: err.message,
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // POST: Create notification
  // ─────────────────────────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    try {
      const b = parseBody<{
        user_id?: string;
        role_target?: string;
        type?: string;
        title?: string;
        message?: string;
        data?: Record<string, unknown>;
      }>(req);

      const title = String(b.title || '').trim();
      const message = String(b.message || '').trim();
      const type = String(b.type || 'general').trim().toLowerCase();
      const roleTarget = b.role_target ? String(b.role_target).trim().toLowerCase() : (user.role === 'customer' ? null : 'admin');
      const targetUserId = b.user_id ? String(b.user_id).trim() : (user.role === 'customer' ? user.id : null);
      const data = b.data && typeof b.data === 'object' ? b.data : {};

      if (!title || !message) {
        return errorResponse(res, 'Notification title and message are required.', 400);
      }

      // Normal customers cannot send notifications targeting admin or other users
      if (user.role === 'customer' && roleTarget && roleTarget !== 'customer') {
        return errorResponse(res, 'Customers cannot target administrative notifications.', 403);
      }

      const rows = await sql`
        INSERT INTO public.notifications (
          user_id, role_target, type, title, message, data, is_read, created_at
        ) VALUES (
          ${targetUserId},
          ${roleTarget},
          ${type},
          ${title},
          ${message},
          ${JSON.stringify(data)},
          FALSE,
          NOW()
        )
        RETURNING id, user_id, role_target, type, title, message, data, is_read, created_at
      `;

      return successResponse(res, rows[0], 201, 'Notification created.');
    } catch (err: any) {
      console.error('Error creating notification:', err);
      return errorResponse(res, 'Failed to create notification.', 500, {
        message: err.message,
      });
    }
  }
}
