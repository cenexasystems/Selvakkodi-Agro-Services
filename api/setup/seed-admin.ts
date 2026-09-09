import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '../_lib/db.js';
import { ensureMethod, successResponse, errorResponse, parseBody } from '../_lib/response.js';
import { hashPassword } from '../_lib/password.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!ensureMethod(req, res, ['POST'])) return;

  try {
    const body = parseBody<{
      adminEmail?: string;
      adminPassword?: string;
      adminName?: string;
    }>(req);

    // Check if an admin already exists in the system
    const existingAdmins = await sql`
      SELECT id, name, email, role FROM public.users WHERE role = 'admin' LIMIT 1
    `;

    if (existingAdmins && existingAdmins.length > 0) {
      return successResponse(res, {
        adminExists: true,
        email: existingAdmins[0].email,
        name: existingAdmins[0].name,
      }, 200, 'Admin account already exists.');
    }

    const email = body.adminEmail?.trim().toLowerCase() || 'admin@selvakkodi.local';
    const password = body.adminPassword || 'Admin@123';
    const name = body.adminName?.trim() || 'Administrator';

    const passwordHash = await hashPassword(password);

    const inserted = await sql`
      INSERT INTO public.users (name, email, password_hash, role)
      VALUES (${name}, ${email}, ${passwordHash}, 'admin')
      RETURNING id, customer_code, name, email, role
    `;

    return successResponse(res, {
      admin: inserted[0],
    }, 201, 'Admin user successfully initialized.');
  } catch (err: any) {
    console.error('Seed admin error:', err);
    return errorResponse(res, 'Failed to initialize admin account.', 500, {
      message: err.message,
    });
  }
}
