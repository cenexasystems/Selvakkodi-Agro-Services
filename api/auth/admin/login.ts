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
        const isMatch = await comparePassword(password, candidate.password_hash);
        if (isMatch) {
          user = candidate;
        }
      }
    }

    // 2. If no DB match, check environment-configured admin / staff accounts
    if (!user) {
      const adminEnvId = (process.env.VITE_ADMIN_ID || 'admin').toLowerCase();
      const adminEnvHash = process.env.VITE_ADMIN_PASSWORD_HASH || '';
      const staffEnvId = (process.env.VITE_STAFF_ID || 'staff').toLowerCase();
      const staffEnvHash = process.env.VITE_STAFF_PASSWORD_HASH || '';

      const customAdminPwd = process.env.VITE_ADMIN_PASSWORD || '';
      const customStaffPwd = process.env.VITE_STAFF_PASSWORD || '';

      const checkCredentialMatch = async (id: string, pwd: string, expectedHash: string, customPwd: string): Promise<boolean> => {
        if (customPwd && pwd === customPwd) return true;
        if (!expectedHash) return false;
        // Direct compare or bcrypt
        if (await comparePassword(pwd, expectedHash)) return true;
        // Legacy client-side salted hash: sas_auth_v1:{id}:{pwd}
        const salted = `sas_auth_v1:${id.toLowerCase()}:${pwd}`;
        const saltedHash = (await import('crypto')).createHash('sha256').update(salted).digest('hex');
        return saltedHash === expectedHash;
      };

      if (lowerLoginId === adminEnvId || lowerLoginId === 'admin') {
        const matchesEnv = await checkCredentialMatch(adminEnvId, password, adminEnvHash, customAdminPwd);

        if (matchesEnv) {
          // Provision or update admin in database
          const bHash = await hashPassword(password);
          const adminEmail = 'admin@selvakkodi.local';
          const inserted = await sql`
            INSERT INTO public.users (name, email, password_hash, role)
            VALUES ('Administrator', ${adminEmail}, ${bHash}, 'admin')
            ON CONFLICT (email) DO UPDATE SET
              password_hash = EXCLUDED.password_hash,
              role = 'admin',
              updated_at = NOW()
            RETURNING id, customer_code, name, email, mobile, role, avatar_url
          `;
          user = inserted[0];
        }
      } else if (lowerLoginId === staffEnvId || lowerLoginId === 'staff') {
        const matchesEnv = await checkCredentialMatch(staffEnvId, password, staffEnvHash, customStaffPwd);

        if (matchesEnv) {
          // Provision or update staff in database
          const bHash = await hashPassword(password);
          const staffEmail = 'staff@selvakkodi.local';
          const inserted = await sql`
            INSERT INTO public.users (name, email, password_hash, role)
            VALUES ('Store Staff', ${staffEmail}, ${bHash}, 'staff')
            ON CONFLICT (email) DO UPDATE SET
              password_hash = EXCLUDED.password_hash,
              role = 'staff',
              updated_at = NOW()
            RETURNING id, customer_code, name, email, mobile, role, avatar_url
          `;
          user = inserted[0];

          // Ensure staff table entry exists
          await sql`
            INSERT INTO public.staff (user_id, name, role, is_active)
            VALUES (${user.id}, 'Store Staff', 'staff', true)
            ON CONFLICT DO NOTHING
          `;
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
