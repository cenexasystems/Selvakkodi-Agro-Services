import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '../_lib/db.js';
import { ensureMethod, successResponse, errorResponse } from '../_lib/response.js';
import { requireAuth } from '../_lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!ensureMethod(req, res, ['GET'])) return;

  const user = await requireAuth(req, res);
  if (!user) return;

  try {
    const userPhoneClean = (user.mobile || '').replace(/\D/g, '');

    const orders = await sql`
      SELECT 
        id, invoice_no, user_id, customer_name, phone, address, items,
        subtotal, shipping, total, status, order_mode, order_type,
        delivery_charge, discount_amount, manual_discount_amount,
        coupon_code, coupon_percentage, total_gst, gst_amount,
        payment_method, payment_mode, invoice_pdf_url, created_at
      FROM public.orders
      WHERE 
        user_id = ${user.id}
        OR (${userPhoneClean !== ''} AND (phone = ${user.mobile} OR phone = ${userPhoneClean}))
      ORDER BY created_at DESC
      LIMIT 100
    `;

    return successResponse(res, orders);
  } catch (err: any) {
    console.error('Error retrieving customer orders:', err);
    return errorResponse(res, 'Failed to retrieve orders.', 500, { message: err.message });
  }
}
