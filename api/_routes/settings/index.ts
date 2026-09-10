import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '../_lib/db.js';
import { ensureMethod, successResponse, errorResponse, parseBody } from '../_lib/response.js';
import { requireRole } from '../_lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!ensureMethod(req, res, ['GET', 'PUT'])) return;

  if (req.method === 'GET') {
    try {
      const rows = await sql`
        SELECT id, name, owner_name, phone, email, address, gst_enabled, low_stock_limit, instagram, updated_at
        FROM public.store_settings
        WHERE id = 1
        LIMIT 1
      `;

      if (!rows || rows.length === 0) {
        // Fallback default
        return successResponse(res, {
          id: 1,
          name: 'Selvakkodi Agro Service',
          owner_name: 'S. Rajesh Kumar',
          ownerName: 'S. Rajesh Kumar',
          phone: '9080788263 & 9677791900',
          email: 'selvakkodiagroservice@gmail.com',
          address: 'No.499/A, Thanipadi Main Road, Thandarampattu, Tiruvannamalai District, Tamil Nadu, PIN 606707',
          gst_enabled: false,
          gstEnabled: false,
          low_stock_limit: 5,
          lowStockLimit: 5,
          instagram: 'selvakkodi_agro_service',
        });
      }

      const r = rows[0];
      return successResponse(res, {
        id: r.id,
        name: r.name,
        owner_name: r.owner_name,
        ownerName: r.owner_name,
        phone: r.phone,
        email: r.email,
        address: r.address,
        gst_enabled: r.gst_enabled,
        gstEnabled: r.gst_enabled,
        low_stock_limit: Number(r.low_stock_limit ?? 5),
        lowStockLimit: Number(r.low_stock_limit ?? 5),
        instagram: r.instagram || 'selvakkodi_agro_service',
        updated_at: r.updated_at,
      });
    } catch (err: any) {
      console.error('Error fetching settings:', err);
      return errorResponse(res, 'Failed to fetch settings.', 500, {
        message: err.message,
      });
    }
  }

  if (req.method === 'PUT') {
    const user = await requireRole(req, res, ['admin']);
    if (!user) return;

    try {
      const b = parseBody(req);
      const existingRows = await sql`SELECT * FROM public.store_settings WHERE id = 1 LIMIT 1`;
      const current = existingRows[0] || {
        name: 'Selvakkodi Agro Service',
        owner_name: 'S. Rajesh Kumar',
        phone: '9080788263 & 9677791900',
        email: 'selvakkodiagroservice@gmail.com',
        address: 'No.499/A, Thanipadi Main Road, Thandarampattu, Tiruvannamalai District, Tamil Nadu, PIN 606707',
        gst_enabled: false,
        low_stock_limit: 5,
        instagram: 'selvakkodi_agro_service',
      };

      const name = b.name !== undefined ? String(b.name).trim() : current.name;
      const ownerName = b.owner_name !== undefined ? String(b.owner_name).trim() : (b.ownerName !== undefined ? String(b.ownerName).trim() : current.owner_name);
      const phone = b.phone !== undefined ? String(b.phone).trim() : current.phone;
      const email = b.email !== undefined ? String(b.email).trim() : current.email;
      const address = b.address !== undefined ? String(b.address).trim() : current.address;
      const instagram = b.instagram !== undefined ? String(b.instagram).trim() : (current.instagram || 'selvakkodi_agro_service');
      const gstEnabled = b.gst_enabled !== undefined ? Boolean(b.gst_enabled) : (b.gstEnabled !== undefined ? Boolean(b.gstEnabled) : current.gst_enabled);

      const rawLowStockLimit = b.low_stock_limit !== undefined ? b.low_stock_limit : b.lowStockLimit;
      const parsedLowStockLimit = rawLowStockLimit !== undefined ? Number(rawLowStockLimit) : Number(current.low_stock_limit ?? 5);
      const lowStockLimit = Number.isFinite(parsedLowStockLimit) && parsedLowStockLimit >= 0 ? parsedLowStockLimit : 5;

      const rows = await sql`
        INSERT INTO public.store_settings (id, name, owner_name, phone, email, address, gst_enabled, low_stock_limit, instagram, updated_at)
        VALUES (1, ${name}, ${ownerName}, ${phone}, ${email}, ${address}, ${gstEnabled}, ${lowStockLimit}, ${instagram}, NOW())
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          owner_name = EXCLUDED.owner_name,
          phone = EXCLUDED.phone,
          email = EXCLUDED.email,
          address = EXCLUDED.address,
          gst_enabled = EXCLUDED.gst_enabled,
          low_stock_limit = EXCLUDED.low_stock_limit,
          instagram = EXCLUDED.instagram,
          updated_at = NOW()
        RETURNING id, name, owner_name, phone, email, address, gst_enabled, low_stock_limit, instagram, updated_at
      `;

      const r = rows[0];
      return successResponse(res, {
        id: r.id,
        name: r.name,
        owner_name: r.owner_name,
        ownerName: r.owner_name,
        phone: r.phone,
        email: r.email,
        address: r.address,
        gst_enabled: r.gst_enabled,
        gstEnabled: r.gst_enabled,
        low_stock_limit: Number(r.low_stock_limit ?? 5),
        lowStockLimit: Number(r.low_stock_limit ?? 5),
        instagram: r.instagram || 'selvakkodi_agro_service',
        updated_at: r.updated_at,
      }, 200, 'Settings updated successfully.');
    } catch (err: any) {
      console.error('Error updating settings:', err);
      return errorResponse(res, 'Failed to update settings.', 500, {
        message: err.message,
      });
    }
  }
}
