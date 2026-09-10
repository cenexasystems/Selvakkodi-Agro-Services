import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '../_lib/db.js';
import { ensureMethod, successResponse, errorResponse, parseBody } from '../_lib/response.js';
import { requireRole } from '../_lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!ensureMethod(req, res, ['GET', 'POST'])) return;

  if (req.method === 'GET') {
    try {
      const { productId, product_id, all } = req.query || {};
      const targetProductId = (productId || product_id) ? parseInt(String(productId || product_id), 10) : null;
      const includeInactive = all === 'true';

      let rows;
      if (targetProductId && Number.isFinite(targetProductId)) {
        if (includeInactive) {
          rows = await sql`
            SELECT id, product_id, variant_name, size_label, weight_value, weight_unit,
                   sku, barcode, purchase_price, mrp, price, stock, is_default, is_active,
                   sort_order, image_url, group_name, created_at, updated_at
            FROM public.product_variants
            WHERE product_id = ${targetProductId}
            ORDER BY sort_order ASC, variant_name ASC
          `;
        } else {
          rows = await sql`
            SELECT id, product_id, variant_name, size_label, weight_value, weight_unit,
                   sku, barcode, purchase_price, mrp, price, stock, is_default, is_active,
                   sort_order, image_url, group_name, created_at, updated_at
            FROM public.product_variants
            WHERE product_id = ${targetProductId} AND is_active = true
            ORDER BY sort_order ASC, variant_name ASC
          `;
        }
      } else if (includeInactive) {
        rows = await sql`
          SELECT id, product_id, variant_name, size_label, weight_value, weight_unit,
                 sku, barcode, purchase_price, mrp, price, stock, is_default, is_active,
                 sort_order, image_url, group_name, created_at, updated_at
          FROM public.product_variants
          ORDER BY sort_order ASC, variant_name ASC
        `;
      } else {
        rows = await sql`
          SELECT id, product_id, variant_name, size_label, weight_value, weight_unit,
                 sku, barcode, purchase_price, mrp, price, stock, is_default, is_active,
                 sort_order, image_url, group_name, created_at, updated_at
          FROM public.product_variants
          WHERE is_active = true
          ORDER BY sort_order ASC, variant_name ASC
        `;
      }

      return successResponse(res, rows);
    } catch (err: any) {
      console.error('Error fetching variants:', err);
      return errorResponse(res, 'Failed to fetch variants.', 500, {
        message: err.message,
      });
    }
  }

  if (req.method === 'POST') {
    const user = await requireRole(req, res, ['admin', 'staff']);
    if (!user) return;

    try {
      const b = parseBody(req);
      const rawProductId = b.productId ?? b.product_id;
      const productId = parseInt(String(rawProductId), 10);
      if (!Number.isFinite(productId) || productId <= 0) {
        return errorResponse(res, 'Valid product ID is required.', 400);
      }

      const variantName = String(b.variantName || b.variant_name || '').trim();
      if (!variantName) {
        return errorResponse(res, 'Variant name is required.', 400);
      }

      const sizeLabel = b.sizeLabel !== undefined ? (b.sizeLabel ? String(b.sizeLabel) : null) : (b.size_label ? String(b.size_label) : null);
      const weightValue = (b.weightValue !== undefined && b.weightValue !== null && b.weightValue !== '')
        ? Number(b.weightValue)
        : ((b.weight_value !== undefined && b.weight_value !== null && b.weight_value !== '') ? Number(b.weight_value) : null);
      const weightUnit = b.weightUnit !== undefined ? (b.weightUnit ? String(b.weightUnit) : null) : (b.weight_unit ? String(b.weight_unit) : null);
      const sku = b.sku ? String(b.sku).trim() : null;
      const barcode = b.barcode ? String(b.barcode).trim() : null;
      const purchasePrice = (b.purchasePrice !== undefined && b.purchasePrice !== null && b.purchasePrice !== '')
        ? Number(b.purchasePrice)
        : ((b.purchase_price !== undefined && b.purchase_price !== null && b.purchase_price !== '') ? Number(b.purchase_price) : null);
      const mrp = (b.mrp !== undefined && b.mrp !== null && b.mrp !== '')
        ? Number(b.mrp)
        : null;
      const price = Number(b.price ?? 0);
      const stock = Number(b.stock ?? 0);
      const isDefault = Boolean(b.isDefault ?? b.is_default ?? false);
      const isActive = b.isActive !== undefined ? Boolean(b.isActive) : (b.is_active !== undefined ? Boolean(b.is_active) : true);
      const sortOrder = Number(b.sortOrder ?? b.sort_order ?? 0) || 0;
      const imageUrl = b.imageUrl ? String(b.imageUrl) : (b.image_url ? String(b.image_url) : null);
      const groupName = b.groupName ? String(b.groupName) : (b.group_name ? String(b.group_name) : null);

      if (isDefault) {
        await sql`
          UPDATE public.product_variants
          SET is_default = false
          WHERE product_id = ${productId}
        `;
      }

      const rows = await sql`
        INSERT INTO public.product_variants (
          product_id, variant_name, size_label, weight_value, weight_unit,
          sku, barcode, purchase_price, mrp, price, stock,
          is_default, is_active, sort_order, image_url, group_name
        ) VALUES (
          ${productId}, ${variantName}, ${sizeLabel}, ${weightValue}, ${weightUnit},
          ${sku}, ${barcode}, ${purchasePrice}, ${mrp}, ${price}, ${stock},
          ${isDefault}, ${isActive}, ${sortOrder}, ${imageUrl}, ${groupName}
        )
        RETURNING *
      `;

      // Set parent product has_variants = true
      await sql`
        UPDATE public.products
        SET has_variants = true, updated_at = NOW()
        WHERE id = ${productId}
      `;

      return successResponse(res, rows[0], 201, 'Variant created successfully.');
    } catch (err: any) {
      if (err.code === '23505') {
        return errorResponse(res, 'A variant with this name already exists for this product.', 409);
      }
      console.error('Error creating variant:', err);
      return errorResponse(res, 'Failed to create variant.', 500, {
        message: err.message,
      });
    }
  }
}
