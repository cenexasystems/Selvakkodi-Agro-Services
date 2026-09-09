import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '../_lib/db.js';
import { ensureMethod, successResponse, errorResponse, parseBody } from '../_lib/response.js';
import { requireRole } from '../_lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!ensureMethod(req, res, ['PUT', 'POST'])) return;

  const user = await requireRole(req, res, ['admin', 'staff']);
  if (!user) return;

  try {
    const b = parseBody(req);
    const variantId = String(b.variantId || b.variant_id || '').trim();
    const rawProductId = b.productId ?? b.product_id;
    const productId = parseInt(String(rawProductId), 10);

    if (!variantId) {
      return errorResponse(res, 'Variant ID is required.', 400);
    }
    if (!Number.isFinite(productId) || productId <= 0) {
      return errorResponse(res, 'Valid product ID is required.', 400);
    }

    // Reset default for other variants of this product
    await sql`
      UPDATE public.product_variants
      SET is_default = false, updated_at = NOW()
      WHERE product_id = ${productId}
    `;

    // Set new default
    const rows = await sql`
      UPDATE public.product_variants
      SET is_default = true, updated_at = NOW()
      WHERE id = ${variantId} AND product_id = ${productId}
      RETURNING *
    `;

    if (!rows || rows.length === 0) {
      return errorResponse(res, 'Variant not found for this product.', 404);
    }

    return successResponse(res, rows[0], 200, 'Default variant set successfully.');
  } catch (err: any) {
    console.error('Error setting default variant:', err);
    return errorResponse(res, 'Failed to set default variant.', 500, {
      message: err.message,
    });
  }
}
