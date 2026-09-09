import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '../_lib/db.js';
import { ensureMethod, successResponse, errorResponse, parseBody } from '../_lib/response.js';
import { requireRole } from '../_lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!ensureMethod(req, res, ['GET', 'PATCH', 'PUT', 'DELETE'])) return;

  const user = await requireRole(req, res, ['admin']);
  if (!user) return;

  const { id } = req.query;
  const couponId = parseInt(String(id), 10);
  if (isNaN(couponId) || couponId <= 0) {
    return errorResponse(res, 'Invalid coupon ID.', 400);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // GET: Fetch Single Coupon
  // ─────────────────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    try {
      const rows = await sql`
        SELECT 
          id, code, percentage, is_active, expiry_date, usage_limit, 
          usage_count, min_order_value, created_at, updated_at
        FROM public.coupons
        WHERE id = ${couponId}
        LIMIT 1
      `;
      if (rows.length === 0) {
        return errorResponse(res, 'Coupon not found.', 404);
      }
      return successResponse(res, rows[0]);
    } catch (err: any) {
      console.error('Error fetching coupon:', err);
      return errorResponse(res, 'Failed to fetch coupon.', 500, { message: err.message });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PATCH/PUT: Update Coupon
  // ─────────────────────────────────────────────────────────────────────────────
  if (req.method === 'PATCH' || req.method === 'PUT') {
    try {
      const existing = await sql`
        SELECT id, code, percentage, is_active, expiry_date, usage_limit, min_order_value
        FROM public.coupons
        WHERE id = ${couponId}
        LIMIT 1
      `;
      if (existing.length === 0) {
        return errorResponse(res, 'Coupon not found.', 404);
      }

      const current = existing[0];
      const body = parseBody<{
        code?: string;
        percentage?: number;
        is_active?: boolean;
        expiry_date?: string | null;
        usage_limit?: number | string | null;
        min_order_value?: number;
      }>(req);

      let code = current.code;
      if (body.code !== undefined) {
        const rawCode = String(body.code).trim().toUpperCase();
        if (!rawCode || rawCode.length < 2) {
          return errorResponse(res, 'Coupon code must be at least 2 characters long.', 422);
        }
        if (rawCode !== current.code) {
          const dup = await sql`
            SELECT id FROM public.coupons 
            WHERE UPPER(BTRIM(code)) = ${rawCode} AND id <> ${couponId}
            LIMIT 1
          `;
          if (dup.length > 0) {
            return errorResponse(res, `Coupon code "${rawCode}" already in use.`, 409);
          }
          code = rawCode;
        }
      }

      let percentage = current.percentage;
      if (body.percentage !== undefined) {
        const p = Number(body.percentage);
        if (isNaN(p) || p <= 0 || p > 100) {
          return errorResponse(res, 'Discount percentage must be between 1 and 100.', 422);
        }
        percentage = p;
      }

      const isActive = body.is_active !== undefined ? Boolean(body.is_active) : current.is_active;

      let minOrderValue = current.min_order_value;
      if (body.min_order_value !== undefined) {
        minOrderValue = Math.max(0, Number(body.min_order_value || 0));
      }

      let usageLimit = current.usage_limit;
      if (body.usage_limit !== undefined) {
        if (body.usage_limit === null || body.usage_limit === '') {
          usageLimit = null;
        } else {
          const lim = parseInt(String(body.usage_limit), 10);
          if (isNaN(lim) || lim <= 0) {
            return errorResponse(res, 'Usage limit must be positive.', 422);
          }
          usageLimit = lim;
        }
      }

      let expiryDate = current.expiry_date;
      if (body.expiry_date !== undefined) {
        if (!body.expiry_date) {
          expiryDate = null;
        } else {
          const d = new Date(body.expiry_date);
          if (isNaN(d.getTime())) {
            return errorResponse(res, 'Invalid expiry date format.', 422);
          }
          expiryDate = d.toISOString();
        }
      }

      const updated = await sql`
        UPDATE public.coupons
        SET 
          code = ${code},
          percentage = ${percentage},
          is_active = ${isActive},
          expiry_date = ${expiryDate},
          usage_limit = ${usageLimit},
          min_order_value = ${minOrderValue},
          updated_at = NOW()
        WHERE id = ${couponId}
        RETURNING id, code, percentage, is_active, expiry_date, usage_limit, usage_count, min_order_value, created_at, updated_at
      `;

      return successResponse(res, updated[0], 200, 'Coupon updated successfully.');
    } catch (err: any) {
      console.error('Error updating coupon:', err);
      return errorResponse(res, 'Failed to update coupon.', 500, { message: err.message });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // DELETE: Delete Coupon
  // ─────────────────────────────────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    try {
      const deleted = await sql`
        DELETE FROM public.coupons
        WHERE id = ${couponId}
        RETURNING id, code
      `;
      if (deleted.length === 0) {
        return errorResponse(res, 'Coupon not found.', 404);
      }
      return successResponse(res, { id: couponId, code: deleted[0].code }, 200, 'Coupon deleted successfully.');
    } catch (err: any) {
      console.error('Error deleting coupon:', err);
      return errorResponse(res, 'Failed to delete coupon.', 500, { message: err.message });
    }
  }
}
