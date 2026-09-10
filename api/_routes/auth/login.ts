import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '../_lib/db.js';
import { ensureMethod, successResponse, errorResponse, parseBody } from '../_lib/response.js';
import { comparePassword } from '../_lib/password.js';
import { signJwtToken, setAuthCookie, recordSession } from '../_lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!ensureMethod(req, res, ['POST'])) return;

  try {
    const body = parseBody<{
      email?: string;
      password?: string;
    }>(req);

    const email = body.email?.trim().toLowerCase();
    const password = body.password?.trim();

    if (!email || !password) {
      return errorResponse(res, 'Email and password are required.', 400);
    }

    // Find user by email
    const users = await sql`
      SELECT id, customer_code, name, email, mobile, password_hash, role, avatar_url
      FROM public.users
      WHERE LOWER(email) = ${email}
      LIMIT 1
    `;

    if (!users || users.length === 0) {
      return errorResponse(res, 'Invalid email or password.', 401);
    }

    const user = users[0];

    let isMatch = false;

    // Check environment variable overrides for Admin and Staff
    const isAdminOverride = process.env.ADMIN_ID && email === process.env.ADMIN_ID.trim().toLowerCase() && password === process.env.ADMIN_PASSWORD;
    const isStaffOverride = process.env.STAFF_ID && email === process.env.STAFF_ID.trim().toLowerCase() && password === process.env.STAFF_PASSWORD;

    if (isAdminOverride || isStaffOverride) {
      isMatch = true;
    } else if (user.password_hash) {
      isMatch = await comparePassword(password, user.password_hash);
    } else {
      return errorResponse(res, 'Account has no password set. Please reset your password.', 401);
    }

    if (!isMatch) {
      return errorResponse(res, 'Invalid email or password.', 401);
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
    }, 200, 'Login successful.');
  } catch (err: any) {
    console.error('Login error:', err);
    return errorResponse(res, 'Authentication failed.', 500, {
      message: err.message,
    });
  }
}
