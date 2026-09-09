import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '../_lib/db.js';
import { ensureMethod, successResponse, errorResponse } from '../_lib/response.js';
import { getAuthenticatedUser } from '../_lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!ensureMethod(req, res, ['GET'])) return;

  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return errorResponse(res, 'Not authenticated.', 401);
    }

    const profiles = await sql`
      SELECT id, customer_code, name, email, mobile, role, avatar_url, created_at, updated_at
      FROM public.profiles
      WHERE id = ${user.id}
      LIMIT 1
    `;
    const profile = profiles[0] || user;

    let staffInfo = null;
    if (user.role === 'staff' || user.role === 'admin') {
      const staffRows = await sql`
        SELECT id, name, role, phone, is_active
        FROM public.staff
        WHERE user_id = ${user.id}
        LIMIT 1
      `;
      if (staffRows && staffRows.length > 0) {
        staffInfo = staffRows[0];
      }
    }

    return successResponse(res, {
      user: {
        id: profile.id,
        customer_code: profile.customer_code,
        name: profile.name,
        email: profile.email,
        mobile: profile.mobile,
        role: profile.role,
        avatar_url: profile.avatar_url,
        staff: staffInfo,
      },
    });
  } catch (err: any) {
    console.error('Error fetching current user:', err);
    return errorResponse(res, 'Failed to fetch user profile.', 500, {
      message: err.message,
    });
  }
}
