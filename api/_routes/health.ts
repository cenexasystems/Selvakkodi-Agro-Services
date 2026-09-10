import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from './_lib/db.js';
import { ensureMethod, successResponse, errorResponse } from './_lib/response.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!ensureMethod(req, res, ['GET'])) return;

  try {
    const startTime = Date.now();
    const rows = await sql`SELECT 1 AS alive, current_database() AS db, NOW() AS server_time`;
    const latencyMs = Date.now() - startTime;

    return successResponse(res, {
      status: 'healthy',
      app: 'Selvakkodi Agro Service API',
      database: 'connected',
      neonDatabase: rows[0]?.db,
      dbServerTime: rows[0]?.server_time,
      latencyMs,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('Health check failed:', err);
    return errorResponse(res, 'Database connection failed', 503, {
      message: err.message,
    });
  }
}
