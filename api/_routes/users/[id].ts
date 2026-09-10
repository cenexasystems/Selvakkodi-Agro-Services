import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '../_lib/db.js';
import { ensureMethod, successResponse, errorResponse, parseBody } from '../_lib/response.js';
import { requireRole } from '../_lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!ensureMethod(req, res, ['GET', 'PATCH'])) return;

  const admin = await requireRole(req, res, ['admin']);
  if (!admin) return;

  const { id } = req.query;
  const targetId = String(id || '').trim();
  if (!targetId || targetId.length < 10) {
    return errorResponse(res, 'Invalid user ID.', 400);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // GET: Fetch User Profile
  // ─────────────────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    try {
      const rows = await sql`
        SELECT id, customer_code, name, email, mobile, role, avatar_url, created_at, updated_at
        FROM public.users
        WHERE id = ${targetId}::UUID
        LIMIT 1
      `;
      if (rows.length === 0) {
        return errorResponse(res, 'User not found.', 404);
      }
      return successResponse(res, rows[0]);
    } catch (err: any) {
      console.error('Error fetching user:', err);
      return errorResponse(res, 'Failed to fetch user.', 500, { message: err.message });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PATCH: Update User Role / Profile (Admin only)
  // ─────────────────────────────────────────────────────────────────────────────
  if (req.method === 'PATCH') {
    try {
      const body = parseBody<{
        role?: string;
        name?: string;
        mobile?: string;
      }>(req);

      const existing = await sql`
        SELECT id, role, email, name, mobile
        FROM public.users
        WHERE id = ${targetId}::UUID
        LIMIT 1
      `;
      if (existing.length === 0) {
        return errorResponse(res, 'User not found.', 404);
      }

      const current = existing[0];
      let newRole = current.role;

      if (body.role !== undefined) {
        const roleClean = String(body.role).trim().toLowerCase();
        if (!['admin', 'staff', 'customer'].includes(roleClean)) {
          return errorResponse(res, "Role must be 'admin', 'staff', or 'customer'.", 422);
        }

        // Prevent admin from removing their own admin privilege if they are the only admin
        if (admin.id === targetId && roleClean !== 'admin') {
          const adminCountRows = await sql`
            SELECT COUNT(*)::INT as count 
            FROM public.users 
            WHERE role = 'admin' AND id <> ${targetId}::UUID
          `;
          const remainingAdmins = Number(adminCountRows[0]?.count || 0);
          if (remainingAdmins === 0) {
            return errorResponse(res, 'Cannot remove admin role: at least one admin account is required.', 400);
          }
        }

        newRole = roleClean;
      }

      const newName = body.name !== undefined ? body.name.trim() : current.name;
      const newMobile = body.mobile !== undefined ? body.mobile.trim() : current.mobile;

      await sql`
        UPDATE public.users
        SET 
          role = ${newRole},
          name = ${newName},
          mobile = ${newMobile},
          updated_at = NOW()
        WHERE id = ${targetId}::UUID
      `;

      await sql`
        UPDATE public.profiles
        SET 
          role = ${newRole},
          name = ${newName},
          mobile = ${newMobile},
          updated_at = NOW()
        WHERE id = ${targetId}::UUID
      `;

      return successResponse(res, {
        id: targetId,
        role: newRole,
        name: newName,
        mobile: newMobile,
      }, 200, 'User updated successfully.');
    } catch (err: any) {
      console.error('Error updating user:', err);
      return errorResponse(res, 'Failed to update user.', 500, { message: err.message });
    }
  }
}
