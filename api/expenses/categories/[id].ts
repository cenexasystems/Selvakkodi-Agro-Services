import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '../../_lib/db.js';
import { ensureMethod, successResponse, errorResponse, parseBody } from '../../_lib/response.js';
import { requireRole } from '../../_lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!ensureMethod(req, res, ['PATCH', 'PUT', 'DELETE'])) return;

  const { id } = req.query;
  const categoryId = parseInt(String(id), 10);
  if (isNaN(categoryId) || categoryId <= 0) {
    return errorResponse(res, 'Valid category ID is required.', 400);
  }

  const user = await requireRole(req, res, ['admin']);
  if (!user) return;

  // ─────────────────────────────────────────────────────────────────────────────
  // PATCH / PUT: Update Category Name or Active Status
  // ─────────────────────────────────────────────────────────────────────────────
  if (req.method === 'PATCH' || req.method === 'PUT') {
    try {
      const body = parseBody<{ name?: string; is_active?: boolean }>(req);

      const existing = await sql`
        SELECT id, name, is_active FROM public.expense_categories WHERE id = ${categoryId}
      `;
      if (existing.length === 0) {
        return errorResponse(res, 'Expense category not found.', 404);
      }
      const cur = existing[0];

      const name = body.name !== undefined ? String(body.name).trim() : cur.name;
      const isActive = body.is_active !== undefined ? Boolean(body.is_active) : cur.is_active;

      if (!name) {
        return errorResponse(res, 'Category name cannot be empty.', 400);
      }

      const updated = await sql`
        UPDATE public.expense_categories
        SET name = ${name}, is_active = ${isActive}
        WHERE id = ${categoryId}
        RETURNING id, name, is_active, created_at
      `;

      return successResponse(res, updated[0]);
    } catch (err: any) {
      console.error('Error updating expense category:', err);
      return errorResponse(res, 'Failed to update expense category.', 500, { message: err.message });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // DELETE: Delete or Soft-Delete Category
  // ─────────────────────────────────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    try {
      // Check if expenses reference this category
      const expenseCount = await sql`
        SELECT COUNT(*)::int as count FROM public.expenses WHERE category_id = ${categoryId}
      `;

      if (expenseCount[0].count > 0) {
        // Soft delete by deactivating to preserve financial audit history
        const deactivated = await sql`
          UPDATE public.expense_categories
          SET is_active = false
          WHERE id = ${categoryId}
          RETURNING id, name, is_active
        `;
        return successResponse(res, {
          message: 'Category deactivated because it is referenced by existing expenses.',
          category: deactivated[0],
          softDeleted: true
        });
      }

      const deleted = await sql`
        DELETE FROM public.expense_categories
        WHERE id = ${categoryId}
        RETURNING id
      `;

      if (deleted.length === 0) {
        return errorResponse(res, 'Expense category not found.', 404);
      }

      return successResponse(res, { message: 'Expense category deleted successfully.', softDeleted: false });
    } catch (err: any) {
      console.error('Error deleting expense category:', err);
      return errorResponse(res, 'Failed to delete expense category.', 500, { message: err.message });
    }
  }
}
