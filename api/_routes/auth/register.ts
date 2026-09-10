import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '../_lib/db.js';
import { ensureMethod, successResponse, errorResponse, parseBody } from '../_lib/response.js';
import { hashPassword } from '../_lib/password.js';
import { isValidEmail } from '../_lib/validate.js';
import { signJwtToken, setAuthCookie, recordSession } from '../_lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!ensureMethod(req, res, ['POST'])) return;

  try {
    const body = parseBody<{
      email?: string;
      password?: string;
      name?: string;
      mobile?: string;
    }>(req);

    const email = body.email?.trim().toLowerCase();
    const password = body.password?.trim();
    const name = body.name?.trim() || '';
    const mobile = body.mobile?.trim() || '';

    if (!email || !isValidEmail(email)) {
      return errorResponse(res, 'Valid email address is required.', 400);
    }

    if (!password || password.length < 6) {
      return errorResponse(res, 'Password must be at least 6 characters long.', 400);
    }

    // Check if email already registered
    const existing = await sql`
      SELECT id FROM public.users WHERE email = ${email} LIMIT 1
    `;
    if (existing && existing.length > 0) {
      return errorResponse(res, 'An account with this email already exists.', 409);
    }

    const passwordHash = await hashPassword(password);

    // Insert user (role = 'customer')
    const insertedUsers = await sql`
      INSERT INTO public.users (name, email, mobile, password_hash, role)
      VALUES (${name}, ${email}, ${mobile}, ${passwordHash}, 'customer')
      RETURNING id, customer_code, name, email, mobile, role, avatar_url, created_at
    `;

    const user = insertedUsers[0];

    // Read full profile created by trigger
    const profiles = await sql`
      SELECT id, customer_code, name, email, mobile, role, avatar_url, created_at
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
    }, 201, 'Account created successfully.');
  } catch (err: any) {
    console.error('Registration error:', err);
    return errorResponse(res, 'Failed to create account.', 500, {
      message: err.message,
    });
  }
}
