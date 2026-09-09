import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '../_lib/db.js';
import { ensureMethod, successResponse, errorResponse } from '../_lib/response.js';
import { requireRole } from '../_lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!ensureMethod(req, res, ['GET'])) return;

  const admin = await requireRole(req, res, ['admin']);
  if (!admin) return;

  try {
    const q = req.query || {};
    const search = q.search ? String(q.search).trim() : null;

    let users;
    if (search) {
      const term = `%${search}%`;
      users = await sql`
        SELECT 
          id, customer_code, name, email, mobile, role, avatar_url, created_at
        FROM public.users
        WHERE 
          name ILIKE ${term}
          OR email ILIKE ${term}
          OR mobile ILIKE ${term}
          OR customer_code ILIKE ${term}
        ORDER BY created_at DESC
        LIMIT 200
      `;
    } else {
      users = await sql`
        SELECT 
          id, customer_code, name, email, mobile, role, avatar_url, created_at
        FROM public.users
        ORDER BY created_at DESC
        LIMIT 200
      `;
    }

    return successResponse(res, users);
  } catch (err: any) {
    console.error('Error fetching users:', err);
    return errorResponse(res, 'Failed to fetch users.', 500, { message: err.message });
  }
}
