import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '../_lib/db.js';
import { ensureMethod, successResponse, errorResponse, parseBody } from '../_lib/response.js';
import { getAuthenticatedUser, requireRole } from '../_lib/auth.js';

interface RawOrderItem {
  id?: string | number;
  product_id?: string | number;
  productId?: string | number;
  variant_id?: string | null;
  variantId?: string | null;
  name?: string;
  product_name?: string;
  tamil_name?: string | null;
  tamilName?: string | null;
  variant_name?: string | null;
  variantName?: string | null;
  quantity?: number;
  qty?: number;
  unit?: string;
  selectedUnit?: string;
  unit_type?: string;
  unitType?: string;
  base_quantity?: number;
  baseQuantity?: number;
  base_price?: number;
  basePrice?: number;
  price?: number;
  line_total?: number;
  lineTotal?: number;
  image_url?: string | null;
  imageUrl?: string | null;
  image?: string | null;
  source?: string;
  item_type?: string;
  itemType?: string;
  note?: string | null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!ensureMethod(req, res, ['GET', 'POST'])) return;

  // ─────────────────────────────────────────────────────────────────────────────
  // GET: List/Search Orders (Staff / Admin)
  // ─────────────────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const user = await requireRole(req, res, ['admin', 'staff']);
    if (!user) return;

    try {
      const q = req.query || {};
      const limit = Math.min(Math.max(1, parseInt(String(q.limit || '500'), 10) || 500), 1000);
      const offset = Math.max(0, parseInt(String(q.offset || '0'), 10) || 0);

      const invoiceNo = q.invoiceNo ? String(q.invoiceNo).trim() : null;
      const phone = q.phone ? String(q.phone).trim() : null;
      const customerName = q.customerName ? String(q.customerName).trim() : null;
      const status = q.status ? String(q.status).trim() : null;
      const orderMode = q.orderMode ? String(q.orderMode).trim() : null;
      const orderType = q.orderType ? String(q.orderType).trim() : null;
      const startDate = q.startDate ? String(q.startDate).trim() : null;
      const endDate = q.endDate ? String(q.endDate).trim() : null;
      const includeItems = q.includeItems === 'true';

      const orders = await sql`
        SELECT 
          id, invoice_no, user_id, customer_name, phone, address, items,
          subtotal, shipping, total, status, order_mode, order_type,
          delivery_charge, discount_amount, manual_discount_amount,
          manual_discount_type, manual_discount_value, coupon_code,
          coupon_percentage, total_gst, gst_amount, gst_enabled,
          payment_method, payment_mode, split_details, invoice_pdf_url,
          remarks, reference_number, billing_date, stock_deducted,
          created_at, updated_at
        FROM public.orders
        WHERE
          (${invoiceNo}::text IS NULL OR invoice_no ILIKE ${'%' + invoiceNo + '%'})
          AND (${phone}::text IS NULL OR phone ILIKE ${'%' + phone + '%'})
          AND (${customerName}::text IS NULL OR customer_name ILIKE ${'%' + customerName + '%'})
          AND (${status}::text IS NULL OR status = ${status})
          AND (${orderMode}::text IS NULL OR order_mode = ${orderMode})
          AND (${orderType}::text IS NULL OR order_type = ${orderType})
          AND (${startDate}::timestamptz IS NULL OR created_at >= ${startDate}::timestamptz)
          AND (${endDate}::timestamptz IS NULL OR created_at <= ${endDate}::timestamptz)
        ORDER BY created_at DESC
        LIMIT ${limit}
        OFFSET ${offset}
      `;

      if (includeItems && orders.length > 0) {
        const orderIds = orders.map((o: any) => o.id);
        const allItems = await sql`
          SELECT 
            id, order_id, product_id, variant_id, product_name, name,
            tamil_name, variant_name, quantity, unit, unit_type,
            base_price, unit_price, line_total, image_url, is_manual,
            source, note, created_at
          FROM public.order_items
          WHERE order_id = ANY(${orderIds})
          ORDER BY id ASC
        `;

        const itemsByOrderId = new Map<string, any[]>();
        for (const it of allItems) {
          const list = itemsByOrderId.get(it.order_id) || [];
          list.push(it);
          itemsByOrderId.set(it.order_id, list);
        }

        for (const order of orders) {
          order.order_items = itemsByOrderId.get(order.id) || [];
        }
      }

      return successResponse(res, orders);
    } catch (err: any) {
      console.error('Error querying orders:', err);
      return errorResponse(res, 'Failed to retrieve orders.', 500, { message: err.message });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // POST: Create Order with Server Verification & Atomic Stock Deduction
  // ─────────────────────────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    // Optional authentication: staff/admin for POS, user for customer account, or guest
    const authUser = await getAuthenticatedUser(req);
    const b = parseBody(req);

    // 1. Validate customer & order basics
    const customerName = String(b.customerName || b.customer_name || 'Walk-in Customer').trim();
    const rawPhone = String(b.phone || '').trim();
    const cleanPhone = rawPhone.replace(/\D/g, '');
    const address = String(b.address || 'POS Counter').trim();
    const rawItems: RawOrderItem[] = Array.isArray(b.items) ? b.items : [];

    if (rawItems.length === 0) {
      return errorResponse(res, 'Order must contain at least one item.', 400);
    }

    const orderMode = String(b.orderMode || b.order_mode || 'offline').toLowerCase();
    const orderType = String(b.orderType || b.order_type || 'pos_sale').toLowerCase();
    const status = String(b.status || 'completed').toLowerCase();
    const paymentMethod = String(b.paymentMethod || b.payment_method || b.paymentMode || b.payment_mode || 'cash').toLowerCase();
    const splitDetails = (typeof b.splitDetails === 'object' && b.splitDetails !== null) ? b.splitDetails : {};
    const remarks = b.remarks ? String(b.remarks).trim() : null;
    const referenceNumber = b.referenceNumber || b.reference_number ? String(b.referenceNumber || b.reference_number).trim() : null;
    const billingDate = b.billingDate || b.billing_date ? new Date(b.billingDate || b.billing_date).toISOString() : null;
    const gstEnabled = Boolean(b.gstEnabled ?? b.gst_enabled);
    const userId = authUser ? authUser.id : (b.userId || b.user_id || null);

    // 2. Fetch and verify catalog items to prevent client-side price tampering
    const referencedProductIds: number[] = [];
    const referencedVariantIds: string[] = [];

    for (const item of rawItems) {
      const pid = item.product_id ?? item.productId ?? item.id;
      if (pid && String(pid).match(/^\d+$/)) {
        referencedProductIds.push(parseInt(String(pid), 10));
      }
      const vid = item.variant_id ?? item.variantId;
      if (vid && typeof vid === 'string' && vid.trim().length > 10) {
        referencedVariantIds.push(vid.trim());
      }
    }

    let catalogProducts: any[] = [];
    if (referencedProductIds.length > 0) {
      catalogProducts = await sql`
        SELECT id, name, tamil_name, price, offer_price, stock_quantity, unit, unit_type, is_active
        FROM public.products
        WHERE id = ANY(${referencedProductIds})
      `;
    }

    let catalogVariants: any[] = [];
    if (referencedVariantIds.length > 0) {
      catalogVariants = await sql`
        SELECT id, product_id, variant_name, price, stock, is_active
        FROM public.product_variants
        WHERE id = ANY(${referencedVariantIds})
      `;
    }

    const productMap = new Map<number, any>(catalogProducts.map(p => [Number(p.id), p]));
    const variantMap = new Map<string, any>(catalogVariants.map(v => [String(v.id), v]));

    // 3. Normalize and calculate items & subtotal server-side
    let calculatedSubtotal = 0;
    const structuredItems = [];

    for (const item of rawItems) {
      const quantity = Math.max(0, Number(item.quantity ?? item.qty ?? 0));
      if (quantity <= 0 || !Number.isFinite(quantity)) {
        return errorResponse(res, `Invalid quantity for item "${item.name || 'Product'}". Quantity must be greater than 0.`, 422);
      }

      const pidRaw = item.product_id ?? item.productId ?? item.id;
      const pid = (pidRaw && String(pidRaw).match(/^\d+$/)) ? parseInt(String(pidRaw), 10) : null;
      const vidRaw = item.variant_id ?? item.variantId;
      const vid = (vidRaw && typeof vidRaw === 'string' && vidRaw.trim().length > 10) ? vidRaw.trim() : null;

      const product = pid ? productMap.get(pid) : null;
      const variant = vid ? variantMap.get(vid) : null;

      let trustedUnitPrice: number;
      let name = String(item.name || item.product_name || (product ? product.name : 'Product')).trim();
      let tamilName = item.tamil_name || item.tamilName || (product ? product.tamil_name : null);
      let variantName = item.variant_name || item.variantName || (variant ? variant.variant_name : null);
      let unit = String(item.unit || item.selectedUnit || (product ? product.unit : 'piece')).trim();
      let unitType = String(item.unit_type || item.unitType || (product ? product.unit_type : 'unit')).trim();
      const source = String(item.source || (product ? 'catalogue' : 'manual')).trim();

      if (source === 'manual' || !product) {
        // Manual sale / service item
        trustedUnitPrice = Math.max(0, Number(item.base_price ?? item.basePrice ?? item.price ?? 0));
      } else if (variant && variant.price !== null && Number(variant.price) > 0) {
        trustedUnitPrice = Number(variant.price);
      } else if (product.offer_price !== null && Number(product.offer_price) > 0) {
        trustedUnitPrice = Number(product.offer_price);
      } else {
        trustedUnitPrice = Math.max(0, Number(product.price || 0));
      }

      const lineTotal = Math.round(quantity * trustedUnitPrice * 100) / 100;
      calculatedSubtotal += lineTotal;

      structuredItems.push({
        product_id: pid,
        id: pid,
        variant_id: vid,
        name,
        product_name: name,
        tamil_name: tamilName,
        variant_name: variantName,
        quantity,
        unit,
        unit_type: unitType,
        base_price: trustedUnitPrice,
        unit_price: trustedUnitPrice,
        line_total: lineTotal,
        source,
        image_url: item.image_url ?? item.imageUrl ?? item.image ?? null,
        note: item.note ? String(item.note).trim() : null,
      });
    }

    calculatedSubtotal = Math.round(calculatedSubtotal * 100) / 100;

    // 4. Validate Coupon server-side
    let couponDiscount = 0;
    let couponPercentage = 0;
    let validCouponCode: string | null = null;
    const requestedCoupon = b.couponCode ? String(b.couponCode).trim() : null;

    if (requestedCoupon) {
      const couponRows = await sql`
        SELECT code, percentage, is_active, expiry_date, usage_limit, usage_count, min_order_value
        FROM public.coupons
        WHERE UPPER(BTRIM(code)) = UPPER(BTRIM(${requestedCoupon}))
        LIMIT 1
      `;

      if (couponRows.length > 0) {
        const c = couponRows[0];
        const isExpired = c.expiry_date && new Date(c.expiry_date).getTime() < Date.now();
        const isLimitReached = c.usage_limit && c.usage_count >= c.usage_limit;
        const meetsMinValue = calculatedSubtotal >= Number(c.min_order_value || 0);

        if (c.is_active && !isExpired && !isLimitReached && meetsMinValue) {
          couponPercentage = Number(c.percentage || 0);
          validCouponCode = c.code;
          couponDiscount = Math.round(calculatedSubtotal * (couponPercentage / 100) * 100) / 100;
        }
      }
    }

    // 5. Manual Discount
    let manualDiscountAmount = 0;
    const manualDiscountType = String(b.manualDiscountType || b.manual_discount_type || 'flat').toLowerCase();
    const manualDiscountValue = Math.max(0, Number(b.manualDiscountValue ?? b.manual_discount_value ?? b.manualDiscountAmount ?? b.manual_discount_amount ?? 0));

    if (manualDiscountType === 'percent') {
      manualDiscountAmount = Math.round(calculatedSubtotal * (Math.min(100, manualDiscountValue) / 100) * 100) / 100;
    } else {
      manualDiscountAmount = Math.min(calculatedSubtotal, manualDiscountValue);
    }

    // 6. Delivery / Shipping / GST
    const shipping = Math.max(0, Number(b.shipping || 0));
    const deliveryCharge = Math.max(0, Number(b.deliveryCharge || b.delivery_charge || shipping));
    const effectiveDelivery = Math.max(shipping, deliveryCharge);

    let totalGst = 0;
    if (gstEnabled) {
      totalGst = Math.max(0, Number(b.totalGst ?? b.total_gst ?? b.gstAmount ?? b.gst_amount ?? 0));
    }

    // 7. Verified Grand Total
    const verifiedTotal = Math.max(
      0,
      Math.round((calculatedSubtotal + effectiveDelivery + totalGst - couponDiscount - manualDiscountAmount) * 100) / 100
    );

    // 8. Execute Atomic Order Creation & Stock Deduction via PostgreSQL Function
    try {
      const rpcResult = await sql`
        SELECT public.create_order_with_stock(
          p_customer_name          := ${customerName},
          p_phone                  := ${cleanPhone || rawPhone},
          p_address                := ${address},
          p_items                  := ${JSON.stringify(structuredItems)}::jsonb,
          p_shipping               := ${effectiveDelivery},
          p_status                 := ${status},
          p_order_mode             := ${orderMode},
          p_order_type             := ${orderType},
          p_delivery_charge        := ${effectiveDelivery},
          p_discount_amount        := ${couponDiscount},
          p_manual_discount_amount := ${manualDiscountAmount},
          p_manual_discount_type   := ${manualDiscountType},
          p_manual_discount_value  := ${manualDiscountValue},
          p_coupon_code            := ${validCouponCode},
          p_coupon_percentage      := ${couponPercentage},
          p_total_gst              := ${totalGst},
          p_gst_enabled            := ${gstEnabled},
          p_payment_method         := ${paymentMethod},
          p_split_details          := ${JSON.stringify(splitDetails)}::jsonb,
          p_user_id                := ${userId}
        ) AS result
      `;

      if (!rpcResult || rpcResult.length === 0 || !rpcResult[0].result) {
        throw new Error('Database order creation returned no result.');
      }

      const result = rpcResult[0].result;
      const orderId = result.orderId || result.order_id || result.id;
      const invoiceNo = result.invoiceNo || result.invoice_no;
      const createdAt = result.createdAt || result.created_at || new Date().toISOString();

      // 9. Update additional POS order metadata if provided
      if (remarks || referenceNumber || billingDate) {
        await sql`
          UPDATE public.orders
          SET
            remarks = COALESCE(${remarks}, remarks),
            reference_number = COALESCE(${referenceNumber}, reference_number),
            billing_date = COALESCE(${billingDate}::timestamptz, billing_date),
            updated_at = NOW()
          WHERE id = ${orderId}
        `;
      }

      // 10. Fetch complete order record to return
      const createdOrderRows = await sql`
        SELECT * FROM public.orders WHERE id = ${orderId} LIMIT 1
      `;
      const createdOrder = createdOrderRows[0] || {
        id: orderId,
        invoice_no: invoiceNo,
        created_at: createdAt,
        subtotal: calculatedSubtotal,
        total: verifiedTotal,
      };

      const createdItems = await sql`
        SELECT * FROM public.order_items WHERE order_id = ${orderId} ORDER BY id ASC
      `;

      return successResponse(res, {
        orderId,
        invoiceNo,
        createdAt,
        order: {
          ...createdOrder,
          order_items: createdItems,
        },
      }, 201, 'Order created successfully.');
    } catch (err: any) {
      console.error('Order creation error:', err);
      const errMsg = String(err.message || err);

      // Check for stock insufficiency exception from Postgres function
      if (/insufficient stock/i.test(errMsg)) {
        return errorResponse(res, errMsg, 409, {
          code: 'INSUFFICIENT_STOCK',
          details: errMsg,
        });
      }

      return errorResponse(res, errMsg || 'Failed to create order.', 500);
    }
  }
}
