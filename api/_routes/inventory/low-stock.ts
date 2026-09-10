import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '../_lib/db.js';
import { ensureMethod, successResponse, errorResponse } from '../_lib/response.js';
import { requireRole } from '../_lib/auth.js';

/**
 * GET /api/inventory/low-stock
 *
 * Returns all active products whose current stock is at or below their
 * individual low_stock_alert threshold (defaulting to 5 when null).
 * SQL does the filtering so the browser never receives a full product dump
 * just to apply a threshold check.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!ensureMethod(req, res, ['GET'])) return;

  const user = await requireRole(req, res, ['admin', 'staff']);
  if (!user) return;

  try {
    const rows = await sql`
      SELECT
        id,
        name,
        category,
        stock_quantity::float AS stock_quantity,
        COALESCE(low_stock_alert, 5)::int AS low_stock_alert
      FROM public.products
      WHERE is_active = true
        AND stock_quantity <= COALESCE(low_stock_alert, 5)
      ORDER BY stock_quantity ASC
    `;

    return successResponse(res, { items: rows });
  } catch (err: any) {
    console.error('low-stock query failed', err);
    return errorResponse(res, 'Failed to load low-stock items', 500, { message: err.message });
  }
}
