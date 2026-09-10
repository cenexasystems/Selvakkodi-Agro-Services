import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '../_lib/db.js';
import { ensureMethod, successResponse, errorResponse, parseBody } from '../_lib/response.js';
import { getAuthenticatedUser, requireRole } from '../_lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!ensureMethod(req, res, ['GET', 'PATCH', 'PUT', 'DELETE'])) return;

  const { id } = req.query;
  if (!id || typeof id !== 'string') {
    return errorResponse(res, 'Staff ID is required.', 400);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // GET: Single Staff Details
  // ─────────────────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    try {
      const user = await getAuthenticatedUser(req);
      const isAdmin = user && user.role === 'admin';

      if (isAdmin) {
        const rows = await sql`
          SELECT id, user_id, name, role, phone, base_salary, is_active, created_at, updated_at
          FROM public.staff
          WHERE id = ${id}
        `;
        if (rows.length === 0) {
          return errorResponse(res, 'Staff member not found.', 404);
        }
        return successResponse(res, rows[0]);
      }

      // Safe view
      const rows = await sql`
        SELECT id, name, role, is_active
        FROM public.staff
        WHERE id = ${id} AND is_active = true
      `;
      if (rows.length === 0) {
        return errorResponse(res, 'Staff member not found.', 404);
      }
      return successResponse(res, rows[0]);
    } catch (err: any) {
      console.error('Error fetching staff member:', err);
      return errorResponse(res, 'Failed to fetch staff member.', 500, { message: err.message });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PATCH/PUT: Update Staff (Admin only)
  // ─────────────────────────────────────────────────────────────────────────────
  if (req.method === 'PATCH' || req.method === 'PUT') {
    const user = await requireRole(req, res, ['admin']);
    if (!user) return;

    try {
      const body = parseBody<{
        name?: string;
        role?: string;
        phone?: string | null;
        base_salary?: number | string;
        is_active?: boolean;
        user_id?: string | null;
      }>(req);

      // Check existence
      const existing = await sql`
        SELECT id, name, role, phone, base_salary, is_active, user_id
        FROM public.staff
        WHERE id = ${id}
      `;
      if (existing.length === 0) {
        return errorResponse(res, 'Staff member not found.', 404);
      }
      const cur = existing[0];

      const name = body.name !== undefined ? String(body.name).trim() : cur.name;
      const role = body.role !== undefined ? String(body.role).trim() : cur.role;
      const phone = body.phone !== undefined ? (body.phone ? String(body.phone).trim() : null) : cur.phone;
      const baseSalary = body.base_salary !== undefined ? (Number(body.base_salary) || 0) : cur.base_salary;
      const isActive = body.is_active !== undefined ? Boolean(body.is_active) : cur.is_active;
      const userId = body.user_id !== undefined ? (body.user_id ? String(body.user_id).trim() : null) : cur.user_id;

      if (!name) {
        return errorResponse(res, 'Staff member name cannot be empty.', 400);
      }
      if (!role) {
        return errorResponse(res, 'Staff role cannot be empty.', 400);
      }

      const updated = await sql`
        UPDATE public.staff
        SET
          name = ${name},
          role = ${role},
          phone = ${phone},
          base_salary = ${baseSalary},
          is_active = ${isActive},
          user_id = ${userId},
          updated_at = NOW()
        WHERE id = ${id}
        RETURNING *
      `;

      return successResponse(res, updated[0]);
    } catch (err: any) {
      console.error('Error updating staff member:', err);
      return errorResponse(res, 'Failed to update staff member.', 500, { message: err.message });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // DELETE: Delete or Deactivate Staff (Admin only)
  // ─────────────────────────────────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    const user = await requireRole(req, res, ['admin']);
    if (!user) return;

    try {
      // Check if attendance records exist
      const attendanceCount = await sql`
        SELECT COUNT(*)::int AS count
        FROM public.attendance
        WHERE staff_id = ${id}
      `;

      if (attendanceCount[0].count > 0) {
        // Soft delete to preserve attendance history
        const deactivated = await sql`
          UPDATE public.staff
          SET is_active = false, updated_at = NOW()
          WHERE id = ${id}
          RETURNING *
        `;
        return successResponse(res, {
          message: 'Staff member deactivated (attendance history preserved).',
          staff: deactivated[0],
          softDeleted: true
        });
      }

      // Hard delete if no attendance logs
      const deleted = await sql`
        DELETE FROM public.staff
        WHERE id = ${id}
        RETURNING *
      `;
      if (deleted.length === 0) {
        return errorResponse(res, 'Staff member not found.', 404);
      }

      return successResponse(res, {
        message: 'Staff member deleted successfully.',
        staff: deleted[0],
        softDeleted: false
      });
    } catch (err: any) {
      console.error('Error deleting staff member:', err);
      return errorResponse(res, 'Failed to delete staff member.', 500, { message: err.message });
    }
  }
}
