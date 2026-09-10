import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '../_lib/db.js';
import { ensureMethod, successResponse, errorResponse, parseBody } from '../_lib/response.js';
import { getAuthenticatedUser, requireRole } from '../_lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!ensureMethod(req, res, ['GET', 'POST'])) return;

  // ─────────────────────────────────────────────────────────────────────────────
  // GET: List Expenses
  // Requires admin or staff authentication. Customers and public are blocked.
  // ─────────────────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    try {
      const user = await getAuthenticatedUser(req);
      if (!user || (user.role !== 'admin' && user.role !== 'staff')) {
        return errorResponse(res, 'Unauthorized to view expenses.', 403);
      }

      const { startDate, endDate, categoryId } = req.query;

      let rows;
      if (startDate && endDate) {
        rows = await sql`
          SELECT 
            e.id, 
            e.category_id, 
            e.amount::float as amount, 
            e.expense_date::text as expense_date, 
            e.description, 
            e.receipt_url, 
            e.created_by, 
            e.created_at, 
            e.updated_at,
            CASE WHEN ec.id IS NOT NULL 
              THEN json_build_object('id', ec.id, 'name', ec.name) 
              ELSE NULL 
            END as expense_categories
          FROM public.expenses e
          LEFT JOIN public.expense_categories ec ON e.category_id = ec.id
          WHERE e.expense_date >= ${String(startDate)}::date
            AND e.expense_date <= ${String(endDate)}::date
          ORDER BY e.expense_date DESC, e.created_at DESC
        `;
      } else if (categoryId) {
        const catId = parseInt(String(categoryId), 10);
        rows = await sql`
          SELECT 
            e.id, 
            e.category_id, 
            e.amount::float as amount, 
            e.expense_date::text as expense_date, 
            e.description, 
            e.receipt_url, 
            e.created_by, 
            e.created_at, 
            e.updated_at,
            CASE WHEN ec.id IS NOT NULL 
              THEN json_build_object('id', ec.id, 'name', ec.name) 
              ELSE NULL 
            END as expense_categories
          FROM public.expenses e
          LEFT JOIN public.expense_categories ec ON e.category_id = ec.id
          WHERE e.category_id = ${catId}
          ORDER BY e.expense_date DESC, e.created_at DESC
        `;
      } else {
        rows = await sql`
          SELECT 
            e.id, 
            e.category_id, 
            e.amount::float as amount, 
            e.expense_date::text as expense_date, 
            e.description, 
            e.receipt_url, 
            e.created_by, 
            e.created_at, 
            e.updated_at,
            CASE WHEN ec.id IS NOT NULL 
              THEN json_build_object('id', ec.id, 'name', ec.name) 
              ELSE NULL 
            END as expense_categories
          FROM public.expenses e
          LEFT JOIN public.expense_categories ec ON e.category_id = ec.id
          ORDER BY e.expense_date DESC, e.created_at DESC
        `;
      }

      return successResponse(res, rows);
    } catch (err: any) {
      console.error('Error fetching expenses:', err);
      return errorResponse(res, 'Failed to fetch expenses.', 500, { message: err.message });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // POST: Record New Expense
  // Requires admin or staff authentication.
  // ─────────────────────────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const user = await requireRole(req, res, ['admin', 'staff']);
    if (!user) return;

    try {
      const body = parseBody<{
        category_id?: number | string;
        amount?: number | string;
        expense_date?: string;
        description?: string | null;
        receipt_url?: string | null;
      }>(req);

      // Validate amount
      const amount = Number(body.amount);
      if (isNaN(amount) || amount <= 0) {
        return errorResponse(res, 'Expense amount must be a positive number greater than 0.', 400);
      }

      // Validate category_id
      const categoryId = parseInt(String(body.category_id), 10);
      if (isNaN(categoryId) || categoryId <= 0) {
        return errorResponse(res, 'Valid category ID is required.', 400);
      }

      const catCheck = await sql`
        SELECT id, name FROM public.expense_categories WHERE id = ${categoryId}
      `;
      if (catCheck.length === 0) {
        return errorResponse(res, 'Specified expense category does not exist.', 404);
      }

      // Validate expense_date
      let expenseDate = body.expense_date ? String(body.expense_date).trim() : '';
      if (!expenseDate) {
        expenseDate = new Date().toISOString().split('T')[0];
      }
      if (isNaN(new Date(expenseDate).getTime())) {
        return errorResponse(res, 'Invalid expense date format (expected YYYY-MM-DD).', 400);
      }

      const description = body.description ? String(body.description).trim() : null;
      const receiptUrl = body.receipt_url ? String(body.receipt_url).trim() : null;

      const inserted = await sql`
        INSERT INTO public.expenses (
          category_id, amount, expense_date, description, receipt_url, created_by, updated_at
        ) VALUES (
          ${categoryId}, ${amount}, ${expenseDate}::date, ${description}, ${receiptUrl}, ${user.id}, NOW()
        )
        RETURNING 
          id, category_id, amount::float as amount, expense_date::text as expense_date, 
          description, receipt_url, created_by, created_at, updated_at
      `;

      const result = {
        ...inserted[0],
        expense_categories: { id: catCheck[0].id, name: catCheck[0].name }
      };

      return successResponse(res, result, 201);
    } catch (err: any) {
      console.error('Error creating expense:', err);
      return errorResponse(res, 'Failed to create expense record.', 500, { message: err.message });
    }
  }
}
