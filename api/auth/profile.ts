import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '../_lib/db.js';
import { ensureMethod, successResponse, errorResponse, parseBody } from '../_lib/response.js';
import { requireAuth } from '../_lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!ensureMethod(req, res, ['GET', 'PUT', 'PATCH'])) return;

  const user = await requireAuth(req, res);
  if (!user) return;

  try {
    if (req.method === 'GET') {
      const profiles = await sql`
        SELECT id, customer_code, name, email, mobile, role, avatar_url, created_at, updated_at
        FROM public.profiles
        WHERE id = ${user.id}
        LIMIT 1
      `;
      return successResponse(res, { profile: profiles[0] || user });
    }

    // PUT or PATCH: update profile
    const body = parseBody<{
      name?: string;
      mobile?: string;
      avatar_url?: string;
    }>(req);

    const name = body.name !== undefined ? body.name.trim() : user.name;
    const mobile = body.mobile !== undefined ? body.mobile.trim() : (user.mobile || '');
    const avatarUrl = body.avatar_url !== undefined ? body.avatar_url.trim() : (user.avatar_url || null);

    // Update in public.users
    await sql`
      UPDATE public.users
      SET
        name = ${name},
        mobile = ${mobile},
        avatar_url = ${avatarUrl},
        updated_at = NOW()
      WHERE id = ${user.id}
    `;

    // Update in public.profiles
    const updatedProfiles = await sql`
      UPDATE public.profiles
      SET
        name = ${name},
        mobile = ${mobile},
        avatar_url = ${avatarUrl},
        updated_at = NOW()
      WHERE id = ${user.id}
      RETURNING id, customer_code, name, email, mobile, role, avatar_url, updated_at
    `;

    return successResponse(res, {
      profile: updatedProfiles[0] || { ...user, name, mobile, avatar_url: avatarUrl },
    }, 200, 'Profile updated successfully.');
  } catch (err: any) {
    console.error('Profile update error:', err);
    return errorResponse(res, 'Failed to update profile.', 500, {
      message: err.message,
    });
  }
}
