import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '../_lib/db.js';
import { ensureMethod, successResponse, errorResponse } from '../_lib/response.js';
import { requireRole } from '../_lib/auth.js';

/**
 * GET /api/inventory/products
 *
 * Returns all active products ordered by name, for use by the POS screen
 * and any component that needs the full in-memory product list with stock info.
 * Response shape: { items: Product[] }
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
      ORDER BY name ASC
    `;

    return successResponse(res, { items: rows });
  } catch (err: any) {
    console.error('products fetch failed', err);
    return errorResponse(res, 'Failed to load products', 500, { message: err.message });
  }
}
