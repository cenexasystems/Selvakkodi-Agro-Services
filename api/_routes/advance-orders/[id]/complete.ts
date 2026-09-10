import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '../../_lib/db.js';
import { ensureMethod, successResponse, errorResponse, parseBody } from '../../_lib/response.js';
import { requireRole } from '../../_lib/auth.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!ensureMethod(req, res, ['POST'])) return;

  const user = await requireRole(req, res, ['admin', 'staff']);
  if (!user) return;

  const idParam = String(req.query.id || '').trim();
  if (!idParam) {
    return errorResponse(res, 'Advance order ID is required.', 400);
  }

  try {
    const isUuid = UUID_REGEX.test(idParam);
    let targetId = idParam;
    if (!isUuid) {
      const lookup = await sql`SELECT id FROM public.advance_orders WHERE deposit_id = ${idParam} LIMIT 1`;
      if (!lookup || lookup.length === 0) return errorResponse(res, 'Advance order not found.', 404);
      targetId = lookup[0].id;
    }

    const b = parseBody(req);
    const paymentMethod = String(b.paymentMethod || b.payment_method || 'cash').trim().toLowerCase();
    const finalAmount = Number(b.finalAmount ?? b.final_amount ?? 0);
    const couponCode = b.couponCode || b.coupon_code ? String(b.couponCode || b.coupon_code).trim().toUpperCase() : null;
    const couponPercentage = Number(b.couponPercentage ?? b.coupon_percentage ?? 0);
    const manualDiscount = Number(b.manualDiscount ?? b.manual_discount ?? 0);
    const remarks = String(b.remarks || '').trim();

    if (!paymentMethod) {
      return errorResponse(res, 'Payment method is required.', 400);
    }
    if (!Number.isFinite(finalAmount) || finalAmount < 0) {
      return errorResponse(res, 'Final amount must be a non-negative number.', 400);
    }

    const validUserId = user.id && UUID_REGEX.test(String(user.id)) ? String(user.id) : null;

    const result = await sql`
      SELECT * FROM public.complete_advance_order_v2(
        ${targetId}::uuid,
        ${paymentMethod},
        ${finalAmount},
        ${couponCode},
        ${couponPercentage},
        ${manualDiscount},
        ${remarks},
        ${validUserId}::uuid
      )
    `;

    if (!result || result.length === 0) {
      return errorResponse(res, 'Failed to complete advance order.', 500);
    }

    const row = result[0];
    return successResponse(
      res,
      {
        order_id: row.order_id,
        invoice_no: row.invoice_no,
        completed_at: row.completed_at,
      },
      200,
      `Advance order completed successfully. Invoice #${row.invoice_no} generated.`
    );
  } catch (err: any) {
    console.error('Error completing advance order:', err);
    return errorResponse(res, err.message || 'Failed to complete advance order.', 500);
  }
}
