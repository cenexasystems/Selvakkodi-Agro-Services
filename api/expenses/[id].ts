import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '../_lib/db.js';
import { ensureMethod, successResponse, errorResponse, parseBody } from '../_lib/response.js';
import { getAuthenticatedUser, requireRole } from '../_lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!ensureMethod(req, res, ['GET', 'PATCH', 'PUT', 'DELETE'])) return;

  const { id } = req.query;
  if (!id || typeof id !== 'string') {
    return errorResponse(res, 'Expense ID is required.', 400);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // GET: Single Expense Details
  // ─────────────────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    try {
      const user = await getAuthenticatedUser(req);
      if (!user || (user.role !== 'admin' && user.role !== 'staff')) {
        return errorResponse(res, 'Unauthorized to view expense details.', 403);
      }

      const rows = await sql`
        SELECT 
          e.id, e.category_id, e.amount::float as amount, e.expense_date::text as expense_date, 
          e.description, e.receipt_url, e.created_by, e.created_at, e.updated_at,
          CASE WHEN ec.id IS NOT NULL 
            THEN json_build_object('id', ec.id, 'name', ec.name) 
            ELSE NULL 
          END as expense_categories
        FROM public.expenses e
        LEFT JOIN public.expense_categories ec ON e.category_id = ec.id
        WHERE e.id = ${id}
      `;

      if (rows.length === 0) {
        return errorResponse(res, 'Expense record not found.', 404);
      }

      return successResponse(res, rows[0]);
    } catch (err: any) {
      console.error('Error fetching expense:', err);
      return errorResponse(res, 'Failed to fetch expense record.', 500, { message: err.message });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PATCH / PUT: Update Expense (Admin only)
  // ─────────────────────────────────────────────────────────────────────────────
  if (req.method === 'PATCH' || req.method === 'PUT') {
    const user = await requireRole(req, res, ['admin']);
    if (!user) return;

    try {
      const body = parseBody<{
        category_id?: number | string;
        amount?: number | string;
        expense_date?: string;
        description?: string | null;
        receipt_url?: string | null;
      }>(req);

      const existing = await sql`
        SELECT id, category_id, amount, expense_date, description, receipt_url
        FROM public.expenses
        WHERE id = ${id}
      `;
      if (existing.length === 0) {
        return errorResponse(res, 'Expense record not found.', 404);
      }
      const cur = existing[0];

      let amount = cur.amount;
      if (body.amount !== undefined) {
        const num = Number(body.amount);
        if (isNaN(num) || num <= 0) {
          return errorResponse(res, 'Expense amount must be a positive number greater than 0.', 400);
        }
        amount = num;
      }

      let categoryId = cur.category_id;
      if (body.category_id !== undefined) {
        const cat = parseInt(String(body.category_id), 10);
        if (isNaN(cat) || cat <= 0) {
          return errorResponse(res, 'Invalid category ID.', 400);
        }
        const check = await sql`SELECT id FROM public.expense_categories WHERE id = ${cat}`;
        if (check.length === 0) {
          return errorResponse(res, 'Specified expense category does not exist.', 404);
        }
        categoryId = cat;
      }

      let expenseDate = cur.expense_date;
      if (body.expense_date !== undefined) {
        const d = String(body.expense_date).trim();
        if (!d || isNaN(new Date(d).getTime())) {
          return errorResponse(res, 'Invalid expense date format.', 400);
        }
        expenseDate = d;
      }

      const description = body.description !== undefined
        ? (body.description ? String(body.description).trim() : null)
        : cur.description;

      const receiptUrl = body.receipt_url !== undefined
        ? (body.receipt_url ? String(body.receipt_url).trim() : null)
        : cur.receipt_url;

      const updated = await sql`
        UPDATE public.expenses
        SET 
          category_id = ${categoryId},
          amount = ${amount},
          expense_date = ${expenseDate}::date,
          description = ${description},
          receipt_url = ${receiptUrl},
          updated_at = NOW()
        WHERE id = ${id}
        RETURNING 
          id, category_id, amount::float as amount, expense_date::text as expense_date, 
          description, receipt_url, created_by, created_at, updated_at
      `;

      return successResponse(res, updated[0]);
    } catch (err: any) {
      console.error('Error updating expense:', err);
      return errorResponse(res, 'Failed to update expense record.', 500, { message: err.message });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // DELETE: Remove Expense (Admin only)
  // ─────────────────────────────────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    const user = await requireRole(req, res, ['admin']);
    if (!user) return;

    try {
      const deleted = await sql`
        DELETE FROM public.expenses
        WHERE id = ${id}
        RETURNING id
      `;

      if (deleted.length === 0) {
        return errorResponse(res, 'Expense record not found.', 404);
      }

      return successResponse(res, { message: 'Expense record deleted successfully.' });
    } catch (err: any) {
      console.error('Error deleting expense:', err);
      return errorResponse(res, 'Failed to delete expense record.', 500, { message: err.message });
    }
  }
}
