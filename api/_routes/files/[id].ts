import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '../_lib/db.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { id } = req.query;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ success: false, error: 'File ID is required' });
  }

  try {
    const rows = await sql`
      SELECT id, filename, content_type, size_bytes, data
      FROM public.uploaded_files
      WHERE id = ${id}
    `;

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'File not found' });
    }

    const file = rows[0];
    const buffer = Buffer.from(file.data, 'base64');

    res.setHeader('Content-Type', file.content_type);
    res.setHeader('Content-Length', String(buffer.length));
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Content-Disposition', `inline; filename="${file.filename.replace(/"/g, '')}"`);

    if (req.method === 'HEAD') {
      return res.status(200).end();
    }

    return res.status(200).end(buffer);
  } catch (err: any) {
    console.error('Error serving file:', err);
    return res.status(500).json({ success: false, error: 'Failed to retrieve file' });
  }
}
