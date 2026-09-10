import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ensureMethod, successResponse, errorResponse } from '../_lib/response.js';
import { getAuthToken, clearAuthCookie, revokeSession } from '../_lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!ensureMethod(req, res, ['POST'])) return;

  try {
    const token = getAuthToken(req);
    if (token) {
      await revokeSession(token);
    }
    clearAuthCookie(res);

    return successResponse(res, null, 200, 'Logged out successfully.');
  } catch (err: any) {
    console.error('Logout error:', err);
    return errorResponse(res, 'Failed to logout cleanly.', 500, {
      message: err.message,
    });
  }
}
