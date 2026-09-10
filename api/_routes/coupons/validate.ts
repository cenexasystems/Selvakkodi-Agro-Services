import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '../_lib/db.js';
import { ensureMethod, successResponse, errorResponse, parseBody } from '../_lib/response.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!ensureMethod(req, res, ['POST'])) return;

  try {
    const body = parseBody<{
      code?: string;
      subtotal?: number;
    }>(req);

    const rawCode = String(body.code || '').trim().toUpperCase();
    if (!rawCode) {
      return errorResponse(res, 'Coupon code is required.', 422);
    }

    const subtotal = Math.max(0, Number(body.subtotal || 0));

    const rows = await sql`
      SELECT id, code, percentage, is_active, expiry_date, usage_limit, usage_count, min_order_value
      FROM public.coupons
      WHERE UPPER(BTRIM(code)) = ${rawCode}
      LIMIT 1
    `;

    if (rows.length === 0) {
      return errorResponse(res, 'Invalid coupon code.', 404);
    }

    const c = rows[0];

    if (!c.is_active) {
      return errorResponse(res, 'This coupon is no longer active.', 422);
    }

    if (c.expiry_date && new Date(c.expiry_date).getTime() < Date.now()) {
      return errorResponse(res, 'This coupon has expired.', 422);
    }

    if (c.usage_limit !== null && c.usage_limit !== undefined) {
      const limit = Number(c.usage_limit);
      const count = Number(c.usage_count || 0);
      if (count >= limit) {
        return errorResponse(res, 'This coupon has reached its maximum usage limit.', 422);
      }
    }

    const minVal = Number(c.min_order_value || 0);
    if (minVal > 0 && subtotal < minVal) {
      return errorResponse(
        res,
        `Minimum order amount of ${minVal.toFixed(2)} required to apply this coupon.`,
        422,
        { minOrderValue: minVal }
      );
    }

    const percentage = Number(c.percentage || 0);
    const discount = Math.round((subtotal * (percentage / 100)) * 100) / 100;

    return successResponse(res, {
      id: c.id,
      code: c.code,
      percentage,
      discount,
      min_order_value: minVal,
    }, 200, 'Coupon is valid.');
  } catch (err: any) {
    console.error('Error validating coupon:', err);
    return errorResponse(res, 'Failed to validate coupon.', 500, { message: err.message });
  }
}
