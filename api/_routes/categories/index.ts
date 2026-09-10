import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '../_lib/db.js';
import { ensureMethod, successResponse, errorResponse, parseBody } from '../_lib/response.js';
import { requireRole } from '../_lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!ensureMethod(req, res, ['GET', 'POST'])) return;

  if (req.method === 'GET') {
    try {
      const activeOnly = req.query?.active === 'true' || req.query?.active_only === 'true';

      let rows;
      if (activeOnly) {
        rows = await sql`
          SELECT id, name_en, name_ta, is_active, sort_order, created_at, updated_at
          FROM public.categories
          WHERE is_active = true
          ORDER BY sort_order ASC, name_en ASC
        `;
      } else {
        rows = await sql`
          SELECT id, name_en, name_ta, is_active, sort_order, created_at, updated_at
          FROM public.categories
          ORDER BY sort_order ASC, name_en ASC
        `;
      }

      return successResponse(res, rows);
    } catch (err: any) {
      console.error('Error fetching categories:', err);
      return errorResponse(res, 'Failed to fetch categories.', 500, {
        message: err.message,
      });
    }
  }

  if (req.method === 'POST') {
    const user = await requireRole(req, res, ['admin', 'staff']);
    if (!user) return;

    try {
      const body = parseBody(req);
      const nameEn = String(body.name_en || '').trim();
      const nameTa = String(body.name_ta || '').trim();
      const isActive = body.is_active !== undefined ? Boolean(body.is_active) : true;
      const sortOrder = Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 0;

      if (!nameEn) {
        return errorResponse(res, 'Category name (English) is required.', 400);
      }

      const rows = await sql`
        INSERT INTO public.categories (name_en, name_ta, is_active, sort_order)
        VALUES (${nameEn}, ${nameTa}, ${isActive}, ${sortOrder})
        RETURNING id, name_en, name_ta, is_active, sort_order, created_at, updated_at
      `;

      return successResponse(res, rows[0], 201, 'Category created successfully.');
    } catch (err: any) {
      if (err.code === '23505') {
        return errorResponse(res, 'Category with this name already exists.', 409);
      }
      console.error('Error creating category:', err);
      return errorResponse(res, 'Failed to create category.', 500, {
        message: err.message,
      });
    }
  }
}
