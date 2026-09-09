import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from './_lib/db.js';
import { ensureMethod, successResponse, errorResponse, parseBody } from './_lib/response.js';
import { getAuthenticatedUser } from './_lib/auth.js';

// Magic bytes validation to prevent MIME-type spoofing
function validateMagicBytes(buffer: Buffer, declaredType: string): boolean {
  if (buffer.length < 4) return false;

  // JPEG: FF D8 FF
  if (declaredType === 'image/jpeg') {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  // PNG: 89 50 4E 47
  if (declaredType === 'image/png') {
    return buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  }
  // WebP: RIFF ... WEBP
  if (declaredType === 'image/webp') {
    return buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
  }
  // GIF: GIF8
  if (declaredType === 'image/gif') {
    return buffer.toString('ascii', 0, 4) === 'GIF8';
  }
  // PDF: %PDF-
  if (declaredType === 'application/pdf') {
    return buffer.toString('ascii', 0, 5) === '%PDF-';
  }

  return false;
}

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
]);

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_PDF_SIZE = 10 * 1024 * 1024;  // 10 MB

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!ensureMethod(req, res, ['POST'])) return;

  try {
    const user = await getAuthenticatedUser(req);

    const body = parseBody<{
      filename?: string;
      contentType?: string;
      data?: string; // base64 or data URL
      category?: string;
    }>(req);

    const rawData = body.data;
    if (!rawData || typeof rawData !== 'string') {
      return errorResponse(res, 'File data (base64 string or data URL) is required.', 400);
    }

    const category = body.category && typeof body.category === 'string'
      ? body.category.toLowerCase().trim()
      : 'general';

    // ─────────────────────────────────────────────────────────────────────────
    // Authorization checks based on upload category
    // ─────────────────────────────────────────────────────────────────────────
    if (category === 'products') {
      if (!user || user.role !== 'admin') {
        return errorResponse(res, 'Admin authentication required to upload product assets.', 403);
      }
    } else if (category === 'invoices' || category === 'receipts') {
      if (!user || (user.role !== 'admin' && user.role !== 'staff')) {
        return errorResponse(res, 'Staff or admin authorization required to upload receipts/invoices.', 403);
      }
    } else if (category === 'avatars') {
      if (!user) {
        return errorResponse(res, 'Authentication required to upload user avatars.', 401);
      }
    } else {
      // General uploads require authenticated user
      if (!user) {
        return errorResponse(res, 'Authentication required to upload files.', 401);
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Parse base64 and MIME type
    // ─────────────────────────────────────────────────────────────────────────
    let base64Content = rawData;
    let detectedMime = body.contentType ? body.contentType.toLowerCase().trim() : '';

    if (rawData.startsWith('data:')) {
      const commaIdx = rawData.indexOf(',');
      if (commaIdx !== -1) {
        const header = rawData.substring(5, commaIdx);
        const [mime] = header.split(';');
        if (mime) detectedMime = mime.toLowerCase();
        base64Content = rawData.substring(commaIdx + 1);
      }
    }

    if (!detectedMime || !ALLOWED_MIME_TYPES.has(detectedMime)) {
      return errorResponse(res, `Unsupported file type: ${detectedMime || 'unknown'}. Allowed: JPEG, PNG, WebP, GIF, PDF.`, 415);
    }

    const buffer = Buffer.from(base64Content, 'base64');
    const sizeBytes = buffer.length;

    if (sizeBytes === 0) {
      return errorResponse(res, 'Uploaded file is empty.', 400);
    }

    // Size limits
    const isPdf = detectedMime === 'application/pdf';
    const maxSize = isPdf ? MAX_PDF_SIZE : MAX_IMAGE_SIZE;
    if (sizeBytes > maxSize) {
      const limitMb = isPdf ? '10 MB' : '5 MB';
      return errorResponse(res, `File exceeds the maximum allowed size of ${limitMb}.`, 413);
    }

    // Magic bytes verification
    if (!validateMagicBytes(buffer, detectedMime)) {
      return errorResponse(res, 'File content signature does not match declared MIME type.', 400);
    }

    // Clean filename
    let filename = body.filename && typeof body.filename === 'string'
      ? body.filename.trim().replace(/[^a-zA-Z0-9.\-_]/g, '-')
      : `file-${Date.now()}`;
    if (!filename.includes('.')) {
      const extMap: Record<string, string> = {
        'image/jpeg': '.jpg',
        'image/png': '.png',
        'image/webp': '.webp',
        'image/gif': '.gif',
        'application/pdf': '.pdf',
      };
      filename += extMap[detectedMime] || '';
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Persist to Neon Database (uploaded_files table)
    // ─────────────────────────────────────────────────────────────────────────
    const inserted = await sql`
      INSERT INTO public.uploaded_files (
        filename, content_type, size_bytes, category, data, uploaded_by, created_at
      ) VALUES (
        ${filename}, ${detectedMime}, ${sizeBytes}, ${category}, ${base64Content}, ${user ? user.id : null}, NOW()
      )
      RETURNING id, filename, content_type, size_bytes, category, created_at
    `;

    const row = inserted[0];
    const fileUrl = `/api/files/${row.id}`;

    return successResponse(res, {
      url: fileUrl,
      id: row.id,
      filename: row.filename,
      contentType: row.content_type,
      size: Number(row.size_bytes),
      category: row.category,
      createdAt: row.created_at,
    }, 201);
  } catch (err: any) {
    console.error('Error handling upload:', err);
    return errorResponse(res, 'Failed to process file upload.', 500, { message: err.message });
  }
}
