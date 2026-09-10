import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '../../_lib/db.js';
import { ensureMethod, successResponse, errorResponse, parseBody } from '../../_lib/response.js';
import { requireRole } from '../../_lib/auth.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!ensureMethod(req, res, ['PUT'])) return;

  const user = await requireRole(req, res, ['admin', 'staff']);
  if (!user) return;

  const idParam = String(req.query.id || '').trim();
  if (!idParam) {
    return errorResponse(res, 'Order ID is required.', 400);
  }

  const b = parseBody(req);
  const pdfUrl = String(b.invoice_pdf_url || b.invoicePdfUrl || b.url || '').trim();

  if (!pdfUrl) {
    return errorResponse(res, 'Invoice PDF URL is required.', 400);
  }

  try {
    const isUuid = UUID_REGEX.test(idParam);
    let targetId = idParam;

    if (!isUuid) {
      const lookup = await sql`SELECT id FROM public.orders WHERE invoice_no = ${idParam} LIMIT 1`;
      if (!lookup || lookup.length === 0) return errorResponse(res, 'Order not found.', 404);
      targetId = lookup[0].id;
    }

    await sql`
      UPDATE public.orders
      SET 
        invoice_pdf_url = ${pdfUrl},
        updated_at = NOW()
      WHERE id = ${targetId}::uuid
    `;

    return successResponse(res, {
      id: targetId,
      invoice_pdf_url: pdfUrl,
    }, 200, 'Invoice PDF URL updated.');
  } catch (err: any) {
    console.error('Error updating invoice PDF URL:', err);
    return errorResponse(res, 'Failed to update invoice PDF URL.', 500, { message: err.message });
  }
}
