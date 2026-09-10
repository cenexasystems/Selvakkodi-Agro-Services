import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '../../_lib/db.js';
import { ensureMethod, successResponse, errorResponse, parseBody } from '../../_lib/response.js';
import { hashPassword, comparePassword } from '../../_lib/password.js';
import { signJwtToken, setAuthCookie, recordSession } from '../../_lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!ensureMethod(req, res, ['POST'])) return;

  try {
    const body = parseBody<{
      username?: string;
      id?: string;
      password?: string;
    }>(req);

    const loginId = (body.username || body.id || '').trim();
    const password = (body.password || '').trim();

    if (!loginId || !password) {
      return errorResponse(res, 'Username / ID and password are required.', 400);
    }

    const lowerLoginId = loginId.toLowerCase();

    // 1. Try to find user in database where role is 'admin' or 'staff'
    const dbUsers = await sql`
      SELECT id, customer_code, name, email, mobile, password_hash, role, avatar_url
      FROM public.users
      WHERE (
        LOWER(email) = ${lowerLoginId}
        OR LOWER(customer_code) = ${lowerLoginId}
        OR LOWER(name) = ${lowerLoginId}
        OR (role = 'admin' AND ${lowerLoginId} = 'admin')
        OR (role = 'staff' AND ${lowerLoginId} = 'staff')
      )
      AND role IN ('admin', 'staff')
      LIMIT 1
    `;

    let user: any = null;

    if (dbUsers && dbUsers.length > 0) {
      const candidate = dbUsers[0];
      if (candidate.password_hash) {
        const isMatch = await comparePassword(password, candidate.password_hash, lowerLoginId);
        if (isMatch) {
          user = candidate;

          // Seamless security upgrade: If user had a legacy 64-char SHA-256 hash, upgrade to bcrypt in Neon
          if (candidate.password_hash.length === 64) {
            try {
              const upgradedBcryptHash = await hashPassword(password);
              await sql`
                UPDATE public.users
                SET password_hash = ${upgradedBcryptHash}, updated_at = NOW()
                WHERE id = ${candidate.id}
              `;
            } catch (upgradeErr) {
              console.warn('Failed to upgrade legacy password hash to bcrypt:', upgradeErr);
            }
          }
        }
      }
    }

    if (!user) {
      return errorResponse(res, 'Invalid credentials or insufficient permissions.', 401);
    }

    // Fetch profile details
    const profiles = await sql`
      SELECT id, customer_code, name, email, mobile, role, avatar_url
      FROM public.profiles
      WHERE id = ${user.id}
      LIMIT 1
    `;
    const profile = profiles[0] || user;

    const tokenPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      name: user.name || profile.name,
    };

    const token = signJwtToken(tokenPayload);
    setAuthCookie(res, token);
    await recordSession(user.id, token, req);

    return successResponse(res, {
      user: {
        id: profile.id,
        customer_code: profile.customer_code,
        name: profile.name,
        email: profile.email,
        mobile: profile.mobile,
        role: profile.role,
        avatar_url: profile.avatar_url,
      },
      token,
      role: user.role,
    }, 200, 'Admin login successful.');
  } catch (err: any) {
    console.error('Admin login error:', err);
    return errorResponse(res, 'Authentication failed.', 500, {
      message: err.message,
    });
  }
}
