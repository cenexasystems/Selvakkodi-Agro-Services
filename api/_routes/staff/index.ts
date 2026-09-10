import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '../_lib/db.js';
import { ensureMethod, successResponse, errorResponse, parseBody } from '../_lib/response.js';
import { getAuthenticatedUser, requireRole } from '../_lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!ensureMethod(req, res, ['GET', 'POST'])) return;

  // ─────────────────────────────────────────────────────────────────────────────
  // GET: List Staff
  // Admin sees all staff with full details (including salary and inactive status).
  // Public/Kiosk or activeOnly=true sees active staff (id, name, role, is_active).
  // ─────────────────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    try {
      const user = await getAuthenticatedUser(req);
      const isAdmin = user && user.role === 'admin';
      const activeOnly = req.query.activeOnly === 'true' || req.query.active === 'true';

      if (isAdmin && !activeOnly) {
        const rows = await sql`
          SELECT 
            id, user_id, name, role, phone, base_salary, is_active, 
            created_at, updated_at
          FROM public.staff
          ORDER BY name ASC
        `;
        return successResponse(res, rows);
      }

      // Safe view for punch kiosk or active-only queries
      const rows = await sql`
        SELECT id, name, role, is_active
        FROM public.staff
        WHERE is_active = true
        ORDER BY name ASC
      `;
      return successResponse(res, rows);
    } catch (err: any) {
      console.error('Error fetching staff:', err);
      return errorResponse(res, 'Failed to fetch staff list.', 500, { message: err.message });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // POST: Create Staff (Admin only)
  // ─────────────────────────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const user = await requireRole(req, res, ['admin']);
    if (!user) return;

    try {
      const body = parseBody<{
        name?: string;
        role?: string;
        phone?: string;
        base_salary?: number | string;
        is_active?: boolean;
        user_id?: string;
      }>(req);

      if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
        return errorResponse(res, 'Staff member name is required.', 400);
      }
      if (!body.role || typeof body.role !== 'string' || !body.role.trim()) {
        return errorResponse(res, 'Staff role is required.', 400);
      }

      const name = body.name.trim();
      const role = body.role.trim();
      const phone = body.phone && typeof body.phone === 'string' ? body.phone.trim() : null;
      const baseSalary = body.base_salary !== undefined && body.base_salary !== null
        ? Number(body.base_salary) || 0
        : 0;
      const isActive = body.is_active !== undefined ? Boolean(body.is_active) : true;
      const userId = body.user_id && typeof body.user_id === 'string' ? body.user_id.trim() : null;

      const rows = await sql`
        INSERT INTO public.staff (
          name, role, phone, base_salary, is_active, user_id, updated_at
        ) VALUES (
          ${name}, ${role}, ${phone}, ${baseSalary}, ${isActive}, ${userId}, NOW()
        )
        RETURNING *
      `;

      return successResponse(res, rows[0], 201);
    } catch (err: any) {
      console.error('Error creating staff member:', err);
      return errorResponse(res, 'Failed to create staff member.', 500, { message: err.message });
    }
  }
}
