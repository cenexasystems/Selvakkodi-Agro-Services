import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '../_lib/db.js';
import { ensureMethod, successResponse, errorResponse, parseBody } from '../_lib/response.js';
import { requireRole } from '../_lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!ensureMethod(req, res, ['GET', 'POST'])) return;

  if (req.method === 'GET') {
    try {
      const { category_id, category, search, active, active_only, id } = req.query || {};

      // If specific ID queried via query param
      if (id) {
        const prodId = parseInt(id as string, 10);
        if (!Number.isFinite(prodId)) return errorResponse(res, 'Invalid product ID.', 400);
        const rows = await sql`
          SELECT * FROM public.products
          WHERE id = ${prodId}
          LIMIT 1
        `;
        if (!rows || rows.length === 0) return errorResponse(res, 'Product not found.', 404);
        return successResponse(res, rows[0]);
      }

      const activeFilter = active === 'true' || active_only === 'true';

      let rows;
      if (category_id) {
        const catId = parseInt(category_id as string, 10);
        if (activeFilter) {
          rows = await sql`
            SELECT * FROM public.products
            WHERE category_id = ${catId} AND is_active = true
            ORDER BY sort_order ASC, name ASC
          `;
        } else {
          rows = await sql`
            SELECT * FROM public.products
            WHERE category_id = ${catId}
            ORDER BY sort_order ASC, name ASC
          `;
        }
      } else if (category) {
        const catName = String(category).trim();
        if (activeFilter) {
          rows = await sql`
            SELECT * FROM public.products
            WHERE category = ${catName} AND is_active = true
            ORDER BY sort_order ASC, name ASC
          `;
        } else {
          rows = await sql`
            SELECT * FROM public.products
            WHERE category = ${catName}
            ORDER BY sort_order ASC, name ASC
          `;
        }
      } else if (activeFilter) {
        rows = await sql`
          SELECT * FROM public.products
          WHERE is_active = true
          ORDER BY sort_order ASC, name ASC
        `;
      } else {
        rows = await sql`
          SELECT * FROM public.products
          ORDER BY sort_order ASC, name ASC
        `;
      }

      if (search) {
        const q = String(search).toLowerCase();
        rows = rows.filter((r: any) =>
          (r.name && String(r.name).toLowerCase().includes(q)) ||
          (r.name_ta && String(r.name_ta).toLowerCase().includes(q)) ||
          (r.sku && String(r.sku).toLowerCase().includes(q)) ||
          (r.barcode && String(r.barcode).toLowerCase().includes(q))
        );
      }

      return successResponse(res, rows);
    } catch (err: any) {
      console.error('Error fetching products:', err);
      return errorResponse(res, 'Failed to fetch products.', 500, {
        message: err.message,
      });
    }
  }

  if (req.method === 'POST') {
    const user = await requireRole(req, res, ['admin', 'staff']);
    if (!user) return;

    try {
      const b = parseBody(req);

      const name = String(b.name || '').trim();
      if (!name) return errorResponse(res, 'Product name is required.', 400);

      const nameTa = String(b.name_ta || b.nameTa || b.tamil_name || b.tamilName || '').trim();
      const tamilName = String(b.tamil_name || b.tamilName || nameTa).trim();
      const category = String(b.category || 'Uncategorized').trim();
      const categoryId = b.category_id !== undefined && b.category_id !== null && b.category_id !== ''
        ? parseInt(String(b.category_id), 10)
        : (b.categoryId !== undefined && b.categoryId !== null && b.categoryId !== '' ? parseInt(String(b.categoryId), 10) : null);

      const remedy = Array.isArray(b.remedy) ? b.remedy.map((x: any) => String(x)) : [];
      const price = Number(b.price ?? 0);
      const offerPrice = b.offer_price !== undefined && b.offer_price !== null && b.offer_price !== ''
        ? Number(b.offer_price)
        : (b.offerPrice !== undefined && b.offerPrice !== null && b.offerPrice !== '' ? Number(b.offerPrice) : null);
      const purchasePrice = Number(b.purchase_price ?? b.purchasePrice ?? 0);
      const mrp = Number(b.mrp ?? 0);
      const gstPercent = Number(b.gst_percent ?? b.gstPercent ?? 0);

      const validUnitTypes = ['unit', 'weight', 'volume', 'bundle'];
      const rawUnitType = String(b.unit_type || b.unitType || 'unit').toLowerCase();
      const unitType = validUnitTypes.includes(rawUnitType) ? rawUnitType : 'unit';

      const unitLabel = String(b.unit_label || b.unitLabel || 'piece');
      const unit = String(b.unit || unitLabel);
      const baseQuantity = Number(b.base_quantity ?? b.baseQuantity ?? 1) || 1;
      const stockQuantity = Number(b.stock_quantity ?? b.stockQuantity ?? b.stock ?? 0) || 0;
      const openingStock = Number(b.opening_stock ?? b.openingStock ?? stockQuantity);
      const stock = Math.floor(stockQuantity);
      const stockUnit = String(b.stock_unit || b.stockUnit || unitLabel);
      const lowStockAlert = Number(b.low_stock_alert ?? b.lowStockAlert ?? 5);
      const allowDecimalQuantity = Boolean(b.allow_decimal_quantity ?? b.allowDecimalQuantity ?? false);
      const predefinedOptions = Array.isArray(b.predefined_options || b.predefinedOptions)
        ? JSON.stringify(b.predefined_options || b.predefinedOptions)
        : '[]';

      const description = String(b.description || '');
      const descriptionTa = String(b.description_ta || b.descriptionTa || '');
      const benefits = String(b.benefits || '');
      const benefitsTa = String(b.benefits_ta || b.benefitsTa || '');
      const image = String(b.image || b.image_url || b.imageUrl || '/product-placeholder.svg');
      const imageUrl = String(b.image_url || b.imageUrl || image);
      const sku = b.sku ? String(b.sku).trim() : null;
      const barcode = b.barcode ? String(b.barcode).trim() : null;
      const brand = b.brand ? String(b.brand).trim() : null;
      const supplier = b.supplier ? String(b.supplier).trim() : null;
      const size = b.size ? String(b.size).trim() : null;
      const color = b.color ? String(b.color).trim() : null;
      const rating = Number(b.rating ?? 5);
      const hasVariants = Boolean(b.has_variants ?? b.hasVariants ?? false);
      const isActive = b.is_active !== undefined ? Boolean(b.is_active) : (b.isActive !== undefined ? Boolean(b.isActive) : true);
      const sortOrder = Number(b.sort_order ?? b.sortOrder ?? 0) || 0;

      const rows = await sql`
        INSERT INTO public.products (
          name, name_ta, tamil_name, category, category_id,
          remedy, price, offer_price, purchase_price, mrp, gst_percent,
          unit_type, unit_label, unit, base_quantity, stock_quantity,
          opening_stock, stock, stock_unit, low_stock_alert, allow_decimal_quantity,
          predefined_options, description, description_ta, benefits, benefits_ta,
          image, image_url, sku, barcode, brand, supplier, size, color,
          rating, has_variants, is_active, sort_order
        ) VALUES (
          ${name}, ${nameTa}, ${tamilName}, ${category}, ${categoryId},
          ${remedy}, ${price}, ${offerPrice}, ${purchasePrice}, ${mrp}, ${gstPercent},
          ${unitType}, ${unitLabel}, ${unit}, ${baseQuantity}, ${stockQuantity},
          ${openingStock}, ${stock}, ${stockUnit}, ${lowStockAlert}, ${allowDecimalQuantity},
          ${predefinedOptions}::jsonb, ${description}, ${descriptionTa}, ${benefits}, ${benefitsTa},
          ${image}, ${imageUrl}, ${sku}, ${barcode}, ${brand}, ${supplier}, ${size}, ${color},
          ${rating}, ${hasVariants}, ${isActive}, ${sortOrder}
        )
        RETURNING *
      `;

      return successResponse(res, rows[0], 201, 'Product created successfully.');
    } catch (err: any) {
      if (err.code === '23505') {
        return errorResponse(res, 'A product with this name already exists in the selected category.', 409);
      }
      console.error('Error creating product:', err);
      return errorResponse(res, 'Failed to create product.', 500, {
        message: err.message,
      });
    }
  }
}
