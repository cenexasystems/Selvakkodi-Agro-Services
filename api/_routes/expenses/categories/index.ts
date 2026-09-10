import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '../../_lib/db.js';
import { ensureMethod, successResponse, errorResponse, parseBody } from '../../_lib/response.js';
import { requireRole } from '../../_lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!ensureMethod(req, res, ['GET', 'POST'])) return;

  // ─────────────────────────────────────────────────────────────────────────────
  // GET: List Expense Categories
  // ─────────────────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    try {
      const activeOnly = req.query.activeOnly === 'true';
      let rows;
      if (activeOnly) {
        rows = await sql`
          SELECT id, name, is_active, created_at
          FROM public.expense_categories
          WHERE is_active = true
          ORDER BY name ASC
        `;
      } else {
        rows = await sql`
          SELECT id, name, is_active, created_at
          FROM public.expense_categories
          ORDER BY name ASC
        `;
      }
      return successResponse(res, rows);
    } catch (err: any) {
      console.error('Error fetching expense categories:', err);
      return errorResponse(res, 'Failed to fetch expense categories.', 500, { message: err.message });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // POST: Create Category (Admin only)
  // ─────────────────────────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const user = await requireRole(req, res, ['admin']);
    if (!user) return;

    try {
      const body = parseBody<{ name?: string }>(req);
      if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
        return errorResponse(res, 'Category name is required.', 400);
      }

      const name = body.name.trim();
      const existing = await sql`
        SELECT id FROM public.expense_categories WHERE LOWER(name) = LOWER(${name})
      `;
      if (existing.length > 0) {
        return errorResponse(res, 'A category with this name already exists.', 409);
      }

      const inserted = await sql`
        INSERT INTO public.expense_categories (name, is_active, created_at)
        VALUES (${name}, true, NOW())
        RETURNING id, name, is_active, created_at
      `;

      return successResponse(res, inserted[0], 201);
    } catch (err: any) {
      console.error('Error creating expense category:', err);
      return errorResponse(res, 'Failed to create expense category.', 500, { message: err.message });
    }
  }
}
