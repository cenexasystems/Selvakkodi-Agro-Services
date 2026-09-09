import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '../_lib/db.js';
import { ensureMethod, successResponse, errorResponse, parseBody } from '../_lib/response.js';
import { requireRole } from '../_lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!ensureMethod(req, res, ['GET', 'PUT', 'DELETE'])) return;

  const rawId = req.query?.id as string;
  const categoryId = parseInt(rawId, 10);
  if (!Number.isFinite(categoryId) || categoryId <= 0) {
    return errorResponse(res, 'Invalid category ID.', 400);
  }

  if (req.method === 'GET') {
    try {
      const rows = await sql`
        SELECT id, name_en, name_ta, is_active, sort_order, created_at, updated_at
        FROM public.categories
        WHERE id = ${categoryId}
        LIMIT 1
      `;
      if (!rows || rows.length === 0) {
        return errorResponse(res, 'Category not found.', 404);
      }
      return successResponse(res, rows[0]);
    } catch (err: any) {
      console.error('Error fetching category:', err);
      return errorResponse(res, 'Failed to fetch category.', 500, {
        message: err.message,
      });
    }
  }

  if (req.method === 'PUT') {
    const user = await requireRole(req, res, ['admin', 'staff']);
    if (!user) return;

    try {
      const body = parseBody(req);
      const existing = await sql`SELECT * FROM public.categories WHERE id = ${categoryId} LIMIT 1`;
      if (!existing || existing.length === 0) {
        return errorResponse(res, 'Category not found.', 404);
      }

      const current = existing[0];
      const nameEn = body.name_en !== undefined ? String(body.name_en).trim() : current.name_en;
      const nameTa = body.name_ta !== undefined ? String(body.name_ta).trim() : current.name_ta;
      const isActive = body.is_active !== undefined ? Boolean(body.is_active) : current.is_active;
      const sortOrder = body.sort_order !== undefined && Number.isFinite(Number(body.sort_order))
        ? Number(body.sort_order)
        : current.sort_order;

      if (!nameEn) {
        return errorResponse(res, 'Category name cannot be empty.', 400);
      }

      const rows = await sql`
        UPDATE public.categories
        SET name_en = ${nameEn},
            name_ta = ${nameTa},
            is_active = ${isActive},
            sort_order = ${sortOrder},
            updated_at = NOW()
        WHERE id = ${categoryId}
        RETURNING id, name_en, name_ta, is_active, sort_order, created_at, updated_at
      `;

      return successResponse(res, rows[0], 200, 'Category updated successfully.');
    } catch (err: any) {
      if (err.code === '23505') {
        return errorResponse(res, 'Category with this name already exists.', 409);
      }
      console.error('Error updating category:', err);
      return errorResponse(res, 'Failed to update category.', 500, {
        message: err.message,
      });
    }
  }

  if (req.method === 'DELETE') {
    const user = await requireRole(req, res, ['admin', 'staff']);
    if (!user) return;

    try {
      const existing = await sql`SELECT id, name_en FROM public.categories WHERE id = ${categoryId} LIMIT 1`;
      if (!existing || existing.length === 0) {
        return errorResponse(res, 'Category not found.', 404);
      }

      // Safely unlink any referencing products to prevent orphaned foreign-key issues
      await sql`
        UPDATE public.products
        SET category_id = NULL, category = 'Uncategorized', updated_at = NOW()
        WHERE category_id = ${categoryId} OR category = ${existing[0].name_en}
      `;

      await sql`DELETE FROM public.categories WHERE id = ${categoryId}`;

      return successResponse(res, { id: categoryId }, 200, 'Category deleted successfully.');
    } catch (err: any) {
      console.error('Error deleting category:', err);
      return errorResponse(res, 'Failed to delete category.', 500, {
        message: err.message,
      });
    }
  }
}
