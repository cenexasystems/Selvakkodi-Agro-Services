import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '../_lib/db.js';
import { ensureMethod, successResponse, errorResponse, parseBody } from '../_lib/response.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!ensureMethod(req, res, ['POST'])) return;

  try {
    const body = parseBody<{
      staff_id?: string;
      action?: 'punch_in' | 'punch_out';
    }>(req);

    if (!body.staff_id || typeof body.staff_id !== 'string') {
      return errorResponse(res, 'Staff ID is required.', 400);
    }
    if (!body.action || !['punch_in', 'punch_out'].includes(body.action)) {
      return errorResponse(res, 'Invalid action. Must be punch_in or punch_out.', 400);
    }

    const staffId = body.staff_id.trim();
    const action = body.action;

    // 1. Verify that staff exists and is currently active
    const staffRows = await sql`
      SELECT id, name, role, is_active
      FROM public.staff
      WHERE id = ${staffId}
    `;
    if (staffRows.length === 0) {
      return errorResponse(res, 'Staff member not found.', 404);
    }
    const staffMember = staffRows[0];
    if (!staffMember.is_active) {
      return errorResponse(res, 'Cannot record attendance: staff member is currently inactive.', 403);
    }

    // 2. Fetch existing attendance record for today
    const existing = await sql`
      SELECT id, staff_id, date::text as date, status, clock_in, clock_out
      FROM public.attendance
      WHERE staff_id = ${staffId} AND date = CURRENT_DATE
    `;

    // ─────────────────────────────────────────────────────────────────────────
    // PUNCH IN
    // ─────────────────────────────────────────────────────────────────────────
    if (action === 'punch_in') {
      if (existing.length > 0 && existing[0].clock_in) {
        const inTime = new Date(existing[0].clock_in).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
        return errorResponse(res, `${staffMember.name} has already punched in today at ${inTime}.`, 400, {
          record: existing[0]
        });
      }

      let result;
      if (existing.length > 0) {
        result = await sql`
          UPDATE public.attendance
          SET 
            clock_in = NOW(),
            status = 'present'
          WHERE id = ${existing[0].id}
          RETURNING id, staff_id, date::text as date, status, clock_in, clock_out
        `;
      } else {
        result = await sql`
          INSERT INTO public.attendance (
            staff_id, date, status, clock_in
          ) VALUES (
            ${staffId}, CURRENT_DATE, 'present', NOW()
          )
          RETURNING id, staff_id, date::text as date, status, clock_in, clock_out
        `;
      }

      return successResponse(res, {
        message: `${staffMember.name} punched in successfully.`,
        record: result[0]
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PUNCH OUT
    // ─────────────────────────────────────────────────────────────────────────
    if (action === 'punch_out') {
      if (existing.length === 0 || !existing[0].clock_in) {
        return errorResponse(res, `Cannot punch out: ${staffMember.name} has not punched in today.`, 400);
      }

      if (existing[0].clock_out) {
        const outTime = new Date(existing[0].clock_out).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
        return errorResponse(res, `${staffMember.name} has already punched out today at ${outTime}.`, 400, {
          record: existing[0]
        });
      }

      const result = await sql`
        UPDATE public.attendance
        SET clock_out = NOW()
        WHERE id = ${existing[0].id}
        RETURNING id, staff_id, date::text as date, status, clock_in, clock_out
      `;

      return successResponse(res, {
        message: `${staffMember.name} punched out successfully.`,
        record: result[0]
      });
    }
  } catch (err: any) {
    console.error('Error recording staff punch:', err);
    return errorResponse(res, 'Failed to record attendance punch.', 500, { message: err.message });
  }
}
