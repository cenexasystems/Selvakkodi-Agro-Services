import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '../_lib/db.js';
import { ensureMethod, successResponse, errorResponse, parseBody } from '../_lib/response.js';
import { hashPassword, comparePassword } from '../_lib/password.js';
import { requireAuth, signJwtToken, setAuthCookie, recordSession } from '../_lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!ensureMethod(req, res, ['POST'])) return;

  try {
    // 1. Authenticated user only
    const user = await requireAuth(req, res);
    if (!user) return;

    // 2. Parse and validate body parameters
    const body = parseBody<{
      currentPassword?: string;
      newPassword?: string;
      confirmPassword?: string;
    }>(req);

    const currentPassword = (body.currentPassword || '').trim();
    const newPassword = (body.newPassword || '').trim();
    const confirmPassword = (body.confirmPassword || '').trim();

    if (!currentPassword) {
      return errorResponse(res, 'Current password is required.', 400);
    }

    if (!newPassword) {
      return errorResponse(res, 'New password is required.', 400);
    }

    if (newPassword.length < 6) {
      return errorResponse(res, 'New password must be at least 6 characters long.', 400);
    }

    if (!confirmPassword) {
      return errorResponse(res, 'Please confirm your new password.', 400);
    }

    if (newPassword !== confirmPassword) {
      return errorResponse(res, 'New password and confirm password do not match.', 400);
    }

    if (newPassword === currentPassword) {
      return errorResponse(res, 'New password cannot be the same as your current password.', 400);
    }

    // 3. Fetch user's current password hash from Neon
    const dbUsers = await sql`
      SELECT id, name, email, role, password_hash
      FROM public.users
      WHERE id = ${user.id}
      LIMIT 1
    `;

    if (!dbUsers || dbUsers.length === 0) {
      return errorResponse(res, 'User record not found.', 404);
    }

    const dbUser = dbUsers[0];

    // 4. Verify current password
    const isCurrentValid = await comparePassword(currentPassword, dbUser.password_hash || '', dbUser.role);
    if (!isCurrentValid) {
      return errorResponse(res, 'Current password is incorrect.', 400);
    }

    // 5. Hash new password server-side with bcrypt
    const newHash = await hashPassword(newPassword);

    // 6. Update existing Neon password_hash
    await sql`
      UPDATE public.users
      SET password_hash = ${newHash}, updated_at = NOW()
      WHERE id = ${user.id}
    `;

    // 7. Invalidate/revoke previous sessions
    try {
      await sql`
        DELETE FROM public.sessions
        WHERE user_id = ${user.id}
      `;
    } catch (sessionErr) {
      console.warn('Could not revoke old sessions:', sessionErr);
    }

    // 8. Re-issue fresh authentication token & cookie
    const tokenPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    };
    const newToken = signJwtToken(tokenPayload);
    setAuthCookie(res, newToken);
    await recordSession(user.id, newToken, req);

    // 9. Return success response (never return password or password_hash)
    return successResponse(res, {
      message: 'Password changed successfully.',
      token: newToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    }, 200, 'Password changed successfully.');
  } catch (err: any) {
    console.error('Change password error:', err);
    return errorResponse(res, 'Failed to change password.', 500, {
      message: err.message,
    });
  }
}
