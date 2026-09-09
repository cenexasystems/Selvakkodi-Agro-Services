import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '../_lib/db.js';
import { ensureMethod, successResponse, errorResponse, parseBody } from '../_lib/response.js';
import { getAuthenticatedUser, requireRole } from '../_lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!ensureMethod(req, res, ['GET', 'POST'])) return;

  // ─────────────────────────────────────────────────────────────────────────────
  // GET: List Coupons
  // Admin sees all coupons (including inactive & expired).
  // Staff / Customers / Public see only active and unexpired coupons.
  // ─────────────────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    try {
      const user = await getAuthenticatedUser(req);
      const isAdmin = user && user.role === 'admin';

      if (isAdmin) {
        const rows = await sql`
          SELECT 
            id, code, percentage, is_active, expiry_date, usage_limit, 
            usage_count, min_order_value, created_at, updated_at
          FROM public.coupons
          ORDER BY created_at DESC
        `;
        return successResponse(res, rows);
      }

      // Public / POS / Customer listing: active and non-exhausted only
      const rows = await sql`
        SELECT 
          id, code, percentage, is_active, expiry_date, usage_limit, 
          usage_count, min_order_value
        FROM public.coupons
        WHERE is_active = true
          AND (expiry_date IS NULL OR expiry_date > NOW())
          AND (usage_limit IS NULL OR usage_count < usage_limit)
        ORDER BY created_at DESC
        LIMIT 50
      `;
      return successResponse(res, rows);
    } catch (err: any) {
      console.error('Error fetching coupons:', err);
      return errorResponse(res, 'Failed to fetch coupons.', 500, { message: err.message });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // POST: Create Coupon (Admin only)
  // ─────────────────────────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const user = await requireRole(req, res, ['admin']);
    if (!user) return;

    try {
      const body = parseBody<{
        code?: string;
        percentage?: number;
        is_active?: boolean;
        expiry_date?: string | null;
        usage_limit?: number | string | null;
        min_order_value?: number;
      }>(req);

      const rawCode = String(body.code || '').trim().toUpperCase();
      if (!rawCode || rawCode.length < 2) {
        return errorResponse(res, 'Coupon code must be at least 2 characters long.', 422);
      }

      const percentage = Number(body.percentage);
      if (isNaN(percentage) || percentage <= 0 || percentage > 100) {
        return errorResponse(res, 'Discount percentage must be between 1 and 100.', 422);
      }

      const isActive = body.is_active !== undefined ? Boolean(body.is_active) : true;
      const minOrderValue = Math.max(0, Number(body.min_order_value || 0));

      let usageLimit: number | null = null;
      if (body.usage_limit !== undefined && body.usage_limit !== null && body.usage_limit !== '') {
        const parsedLimit = parseInt(String(body.usage_limit), 10);
        if (isNaN(parsedLimit) || parsedLimit <= 0) {
          return errorResponse(res, 'Usage limit must be a positive number if specified.', 422);
        }
        usageLimit = parsedLimit;
      }

      let expiryDate: string | null = null;
      if (body.expiry_date) {
        const d = new Date(body.expiry_date);
        if (isNaN(d.getTime())) {
          return errorResponse(res, 'Invalid expiry date format.', 422);
        }
        expiryDate = d.toISOString();
      }

      // Check unique constraint
      const existing = await sql`
        SELECT id FROM public.coupons 
        WHERE UPPER(BTRIM(code)) = ${rawCode}
        LIMIT 1
      `;
      if (existing.length > 0) {
        return errorResponse(res, `Coupon code "${rawCode}" already exists.`, 409);
      }

      const inserted = await sql`
        INSERT INTO public.coupons (
          code, percentage, is_active, expiry_date, usage_limit, usage_count, min_order_value, created_at, updated_at
        ) VALUES (
          ${rawCode}, ${percentage}, ${isActive}, ${expiryDate}, ${usageLimit}, 0, ${minOrderValue}, NOW(), NOW()
        )
        RETURNING id, code, percentage, is_active, expiry_date, usage_limit, usage_count, min_order_value, created_at, updated_at
      `;

      return successResponse(res, inserted[0], 201, 'Coupon created successfully.');
    } catch (err: any) {
      console.error('Error creating coupon:', err);
      return errorResponse(res, 'Failed to create coupon.', 500, { message: err.message });
    }
  }
}
