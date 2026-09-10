import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '../_lib/db.js';
import { ensureMethod, successResponse, errorResponse, parseBody } from '../_lib/response.js';
import { requireRole } from '../_lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!ensureMethod(req, res, ['GET', 'PUT', 'DELETE'])) return;

  const rawId = req.query?.id as string;
  const productId = parseInt(rawId, 10);
  if (!Number.isFinite(productId) || productId <= 0) {
    return errorResponse(res, 'Invalid product ID.', 400);
  }

  if (req.method === 'GET') {
    try {
      const rows = await sql`
        SELECT * FROM public.products
        WHERE id = ${productId}
        LIMIT 1
      `;
      if (!rows || rows.length === 0) {
        return errorResponse(res, 'Product not found.', 404);
      }
      return successResponse(res, rows[0]);
    } catch (err: any) {
      console.error('Error fetching product:', err);
      return errorResponse(res, 'Failed to fetch product.', 500, {
        message: err.message,
      });
    }
  }

  if (req.method === 'PUT') {
    const user = await requireRole(req, res, ['admin', 'staff']);
    if (!user) return;

    try {
      const existingRows = await sql`SELECT * FROM public.products WHERE id = ${productId} LIMIT 1`;
      if (!existingRows || existingRows.length === 0) {
        return errorResponse(res, 'Product not found.', 404);
      }
      const current = existingRows[0];
      const b = parseBody(req);

      const name = b.name !== undefined ? String(b.name).trim() : current.name;
      if (!name) return errorResponse(res, 'Product name cannot be empty.', 400);

      const nameTa = b.name_ta !== undefined ? String(b.name_ta).trim() : (b.nameTa !== undefined ? String(b.nameTa).trim() : current.name_ta);
      const tamilName = b.tamil_name !== undefined ? String(b.tamil_name).trim() : (b.tamilName !== undefined ? String(b.tamilName).trim() : current.tamil_name);
      const category = b.category !== undefined ? String(b.category).trim() : current.category;

      let categoryId = current.category_id;
      if (b.category_id !== undefined) {
        categoryId = b.category_id === null || b.category_id === '' ? null : parseInt(String(b.category_id), 10);
      } else if (b.categoryId !== undefined) {
        categoryId = b.categoryId === null || b.categoryId === '' ? null : parseInt(String(b.categoryId), 10);
      }

      const remedy = Array.isArray(b.remedy) ? b.remedy.map((x: any) => String(x)) : current.remedy;
      const price = b.price !== undefined ? Number(b.price) : Number(current.price);

      let offerPrice = current.offer_price;
      if (b.offer_price !== undefined) {
        offerPrice = b.offer_price === null || b.offer_price === '' ? null : Number(b.offer_price);
      } else if (b.offerPrice !== undefined) {
        offerPrice = b.offerPrice === null || b.offerPrice === '' ? null : Number(b.offerPrice);
      }

      const purchasePrice = b.purchase_price !== undefined ? Number(b.purchase_price) : (b.purchasePrice !== undefined ? Number(b.purchasePrice) : Number(current.purchase_price));
      const mrp = b.mrp !== undefined ? Number(b.mrp) : Number(current.mrp);
      const gstPercent = b.gst_percent !== undefined ? Number(b.gst_percent) : (b.gstPercent !== undefined ? Number(b.gstPercent) : Number(current.gst_percent));

      const rawUnitType = b.unit_type || b.unitType || current.unit_type;
      const validUnitTypes = ['unit', 'weight', 'volume', 'bundle'];
      const unitType = validUnitTypes.includes(String(rawUnitType).toLowerCase()) ? String(rawUnitType).toLowerCase() : 'unit';

      const unitLabel = b.unit_label !== undefined ? String(b.unit_label) : (b.unitLabel !== undefined ? String(b.unitLabel) : current.unit_label);
      const unit = b.unit !== undefined ? String(b.unit) : current.unit;
      const baseQuantity = b.base_quantity !== undefined ? Number(b.base_quantity) : (b.baseQuantity !== undefined ? Number(b.baseQuantity) : Number(current.base_quantity));

      let stockQuantity = Number(current.stock_quantity);
      if (b.stock_quantity !== undefined) {
        stockQuantity = Number(b.stock_quantity);
      } else if (b.stockQuantity !== undefined) {
        stockQuantity = Number(b.stockQuantity);
      } else if (b.stock !== undefined) {
        stockQuantity = Number(b.stock);
      }

      const stock = Math.floor(stockQuantity);
      const stockUnit = b.stock_unit !== undefined ? String(b.stock_unit) : (b.stockUnit !== undefined ? String(b.stockUnit) : current.stock_unit);
      const lowStockAlert = b.low_stock_alert !== undefined ? Number(b.low_stock_alert) : (b.lowStockAlert !== undefined ? Number(b.lowStockAlert) : Number(current.low_stock_alert));
      const allowDecimalQuantity = b.allow_decimal_quantity !== undefined ? Boolean(b.allow_decimal_quantity) : (b.allowDecimalQuantity !== undefined ? Boolean(b.allowDecimalQuantity) : current.allow_decimal_quantity);

      let predefinedOptions = current.predefined_options;
      if (b.predefined_options !== undefined) {
        predefinedOptions = Array.isArray(b.predefined_options) ? JSON.stringify(b.predefined_options) : '[]';
      } else if (b.predefinedOptions !== undefined) {
        predefinedOptions = Array.isArray(b.predefinedOptions) ? JSON.stringify(b.predefinedOptions) : '[]';
      } else if (typeof predefinedOptions === 'object') {
        predefinedOptions = JSON.stringify(predefinedOptions);
      }

      const description = b.description !== undefined ? String(b.description) : current.description;
      const descriptionTa = b.description_ta !== undefined ? String(b.description_ta) : (b.descriptionTa !== undefined ? String(b.descriptionTa) : current.description_ta);
      const benefits = b.benefits !== undefined ? String(b.benefits) : current.benefits;
      const benefitsTa = b.benefits_ta !== undefined ? String(b.benefits_ta) : (b.benefitsTa !== undefined ? String(b.benefitsTa) : current.benefits_ta);

      let image = current.image;
      let imageUrl = current.image_url;
      if (b.image !== undefined) image = String(b.image);
      if (b.image_url !== undefined) imageUrl = String(b.image_url);
      if (b.imageUrl !== undefined) imageUrl = String(b.imageUrl);
      if (!image) image = imageUrl;
      if (!imageUrl) imageUrl = image;

      const sku = b.sku !== undefined ? (b.sku ? String(b.sku).trim() : null) : current.sku;
      const barcode = b.barcode !== undefined ? (b.barcode ? String(b.barcode).trim() : null) : current.barcode;
      const brand = b.brand !== undefined ? (b.brand ? String(b.brand).trim() : null) : current.brand;
      const supplier = b.supplier !== undefined ? (b.supplier ? String(b.supplier).trim() : null) : current.supplier;
      const size = b.size !== undefined ? (b.size ? String(b.size).trim() : null) : current.size;
      const color = b.color !== undefined ? (b.color ? String(b.color).trim() : null) : current.color;
      const rating = b.rating !== undefined ? Number(b.rating) : Number(current.rating);
      const hasVariants = b.has_variants !== undefined ? Boolean(b.has_variants) : (b.hasVariants !== undefined ? Boolean(b.hasVariants) : current.has_variants);
      const isActive = b.is_active !== undefined ? Boolean(b.is_active) : (b.isActive !== undefined ? Boolean(b.isActive) : current.is_active);
      const sortOrder = b.sort_order !== undefined ? Number(b.sort_order) : (b.sortOrder !== undefined ? Number(b.sortOrder) : Number(current.sort_order));

      const rows = await sql`
        UPDATE public.products
        SET
          name = ${name},
          name_ta = ${nameTa},
          tamil_name = ${tamilName},
          category = ${category},
          category_id = ${categoryId},
          remedy = ${remedy},
          price = ${price},
          offer_price = ${offerPrice},
          purchase_price = ${purchasePrice},
          mrp = ${mrp},
          gst_percent = ${gstPercent},
          unit_type = ${unitType},
          unit_label = ${unitLabel},
          unit = ${unit},
          base_quantity = ${baseQuantity},
          stock_quantity = ${stockQuantity},
          stock = ${stock},
          stock_unit = ${stockUnit},
          low_stock_alert = ${lowStockAlert},
          allow_decimal_quantity = ${allowDecimalQuantity},
          predefined_options = ${predefinedOptions}::jsonb,
          description = ${description},
          description_ta = ${descriptionTa},
          benefits = ${benefits},
          benefits_ta = ${benefitsTa},
          image = ${image},
          image_url = ${imageUrl},
          sku = ${sku},
          barcode = ${barcode},
          brand = ${brand},
          supplier = ${supplier},
          size = ${size},
          color = ${color},
          rating = ${rating},
          has_variants = ${hasVariants},
          is_active = ${isActive},
          sort_order = ${sortOrder},
          updated_at = NOW()
        WHERE id = ${productId}
        RETURNING *
      `;

      return successResponse(res, rows[0], 200, 'Product updated successfully.');
    } catch (err: any) {
      if (err.code === '23505') {
        return errorResponse(res, 'A product with this name already exists in the selected category.', 409);
      }
      console.error('Error updating product:', err);
      return errorResponse(res, 'Failed to update product.', 500, {
        message: err.message,
      });
    }
  }

  if (req.method === 'DELETE') {
    const user = await requireRole(req, res, ['admin', 'staff']);
    if (!user) return;

    try {
      const permanent = req.query?.permanent === 'true';

      if (permanent) {
        await sql`DELETE FROM public.products WHERE id = ${productId}`;
        return successResponse(res, { id: productId, deleted: true }, 200, 'Product permanently deleted.');
      } else {
        // Soft delete (deactivate) by default
        const rows = await sql`
          UPDATE public.products
          SET is_active = false, updated_at = NOW()
          WHERE id = ${productId}
          RETURNING id, name, is_active
        `;
        return successResponse(res, rows[0], 200, 'Product deactivated successfully.');
      }
    } catch (err: any) {
      console.error('Error deleting product:', err);
      return errorResponse(res, 'Failed to delete product.', 500, {
        message: err.message,
      });
    }
  }
}
