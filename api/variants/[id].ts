import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '../_lib/db.js';
import { ensureMethod, successResponse, errorResponse, parseBody } from '../_lib/response.js';
import { requireRole } from '../_lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!ensureMethod(req, res, ['GET', 'PUT', 'DELETE'])) return;

  const variantId = req.query?.id as string;
  if (!variantId || typeof variantId !== 'string') {
    return errorResponse(res, 'Invalid variant ID.', 400);
  }

  if (req.method === 'GET') {
    try {
      const rows = await sql`
        SELECT * FROM public.product_variants
        WHERE id = ${variantId}
        LIMIT 1
      `;
      if (!rows || rows.length === 0) {
        return errorResponse(res, 'Variant not found.', 404);
      }
      return successResponse(res, rows[0]);
    } catch (err: any) {
      console.error('Error fetching variant:', err);
      return errorResponse(res, 'Failed to fetch variant.', 500, {
        message: err.message,
      });
    }
  }

  if (req.method === 'PUT') {
    const user = await requireRole(req, res, ['admin', 'staff']);
    if (!user) return;

    try {
      const existing = await sql`SELECT * FROM public.product_variants WHERE id = ${variantId} LIMIT 1`;
      if (!existing || existing.length === 0) {
        return errorResponse(res, 'Variant not found.', 404);
      }
      const cur = existing[0];
      const b = parseBody(req);

      const variantName = b.variantName !== undefined ? String(b.variantName).trim() : (b.variant_name !== undefined ? String(b.variant_name).trim() : cur.variant_name);
      if (!variantName) return errorResponse(res, 'Variant name cannot be empty.', 400);

      const sizeLabel = b.sizeLabel !== undefined ? (b.sizeLabel ? String(b.sizeLabel) : null) : (b.size_label !== undefined ? (b.size_label ? String(b.size_label) : null) : cur.size_label);
      const weightValue = b.weightValue !== undefined
        ? (b.weightValue !== null && b.weightValue !== '' ? Number(b.weightValue) : null)
        : (b.weight_value !== undefined ? (b.weight_value !== null && b.weight_value !== '' ? Number(b.weight_value) : null) : cur.weight_value);
      const weightUnit = b.weightUnit !== undefined ? (b.weightUnit ? String(b.weightUnit) : null) : (b.weight_unit !== undefined ? (b.weight_unit ? String(b.weight_unit) : null) : cur.weight_unit);
      const sku = b.sku !== undefined ? (b.sku ? String(b.sku).trim() : null) : cur.sku;
      const barcode = b.barcode !== undefined ? (b.barcode ? String(b.barcode).trim() : null) : cur.barcode;
      const purchasePrice = b.purchasePrice !== undefined
        ? (b.purchasePrice !== null && b.purchasePrice !== '' ? Number(b.purchasePrice) : null)
        : (b.purchase_price !== undefined ? (b.purchase_price !== null && b.purchase_price !== '' ? Number(b.purchase_price) : null) : cur.purchase_price);
      const mrp = b.mrp !== undefined
        ? (b.mrp !== null && b.mrp !== '' ? Number(b.mrp) : null)
        : cur.mrp;
      const price = b.price !== undefined ? Number(b.price) : Number(cur.price);
      const stock = b.stock !== undefined ? Number(b.stock) : Number(cur.stock);
      const isDefault = b.isDefault !== undefined ? Boolean(b.isDefault) : (b.is_default !== undefined ? Boolean(b.is_default) : cur.is_default);
      const isActive = b.isActive !== undefined ? Boolean(b.isActive) : (b.is_active !== undefined ? Boolean(b.is_active) : cur.is_active);
      const sortOrder = b.sortOrder !== undefined ? Number(b.sortOrder) : (b.sort_order !== undefined ? Number(b.sort_order) : Number(cur.sort_order));
      const imageUrl = b.imageUrl !== undefined ? (b.imageUrl ? String(b.imageUrl) : null) : (b.image_url !== undefined ? (b.image_url ? String(b.image_url) : null) : cur.image_url);
      const groupName = b.groupName !== undefined ? (b.groupName ? String(b.groupName) : null) : (b.group_name !== undefined ? (b.group_name ? String(b.group_name) : null) : cur.group_name);

      if (isDefault && !cur.is_default) {
        await sql`
          UPDATE public.product_variants
          SET is_default = false
          WHERE product_id = ${cur.product_id}
        `;
      }

      const rows = await sql`
        UPDATE public.product_variants
        SET
          variant_name = ${variantName},
          size_label = ${sizeLabel},
          weight_value = ${weightValue},
          weight_unit = ${weightUnit},
          sku = ${sku},
          barcode = ${barcode},
          purchase_price = ${purchasePrice},
          mrp = ${mrp},
          price = ${price},
          stock = ${stock},
          is_default = ${isDefault},
          is_active = ${isActive},
          sort_order = ${sortOrder},
          image_url = ${imageUrl},
          group_name = ${groupName},
          updated_at = NOW()
        WHERE id = ${variantId}
        RETURNING *
      `;

      return successResponse(res, rows[0], 200, 'Variant updated successfully.');
    } catch (err: any) {
      if (err.code === '23505') {
        return errorResponse(res, 'A variant with this name already exists for this product.', 409);
      }
      console.error('Error updating variant:', err);
      return errorResponse(res, 'Failed to update variant.', 500, {
        message: err.message,
      });
    }
  }

  if (req.method === 'DELETE') {
    const user = await requireRole(req, res, ['admin', 'staff']);
    if (!user) return;

    try {
      const existing = await sql`SELECT product_id FROM public.product_variants WHERE id = ${variantId} LIMIT 1`;
      if (!existing || existing.length === 0) {
        return errorResponse(res, 'Variant not found.', 404);
      }
      const productId = existing[0].product_id;
      const permanent = req.query?.permanent === 'true';

      if (permanent) {
        await sql`DELETE FROM public.product_variants WHERE id = ${variantId}`;
      } else {
        await sql`UPDATE public.product_variants SET is_active = false, updated_at = NOW() WHERE id = ${variantId}`;
      }

      // Check if active variants still exist for this product
      const remaining = await sql`
        SELECT id FROM public.product_variants
        WHERE product_id = ${productId} AND is_active = true
        LIMIT 1
      `;
      if (!remaining || remaining.length === 0) {
        await sql`UPDATE public.products SET has_variants = false, updated_at = NOW() WHERE id = ${productId}`;
      }

      return successResponse(res, { id: variantId }, 200, 'Variant deleted/deactivated successfully.');
    } catch (err: any) {
      console.error('Error deleting variant:', err);
      return errorResponse(res, 'Failed to delete variant.', 500, {
        message: err.message,
      });
    }
  }
}
