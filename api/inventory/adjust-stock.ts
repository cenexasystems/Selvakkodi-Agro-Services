import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '../_lib/db.js';
import { ensureMethod, successResponse, errorResponse, parseBody } from '../_lib/response.js';
import { requireRole } from '../_lib/auth.js';

/**
 * POST /api/inventory/adjust-stock
 *
 * Applies a signed delta to a product's stock_quantity atomically.
 * Body: { id: string | number, delta: number }
 *   - delta > 0  → restock
 *   - delta < 0  → deduction (loss, sale, etc.)
 *
 * Returns the updated product row: { id, stock_quantity, low_stock_alert }
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!ensureMethod(req, res, ['POST'])) return;

  const user = await requireRole(req, res, ['admin', 'staff']);
  if (!user) return;

  try {
    const { id, delta } = parseBody<{ id: string | number; delta: number }>(req);

    const prodId = parseInt(String(id), 10);
    if (!Number.isFinite(prodId) || prodId <= 0) {
      return errorResponse(res, 'Valid product id is required.', 400);
    }
    if (!Number.isFinite(Number(delta))) {
      return errorResponse(res, 'delta must be a finite number.', 400);
    }

    const rows = await sql`
      UPDATE public.products
      SET stock_quantity = GREATEST(0, stock_quantity + ${Number(delta)})
      WHERE id = ${prodId}
      RETURNING
        id,
        stock_quantity::float AS stock_quantity,
        COALESCE(low_stock_alert, 5)::int AS low_stock_alert
    `;

    if (!rows || rows.length === 0) {
      return errorResponse(res, `Product with id ${prodId} not found.`, 404);
    }

    return successResponse(res, { product: rows[0] });
  } catch (err: any) {
    console.error('stock adjustment failed', err);
    return errorResponse(res, 'Failed to adjust stock', 500, { message: err.message });
  }
}
