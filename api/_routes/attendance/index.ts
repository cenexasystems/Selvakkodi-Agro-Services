import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '../_lib/db.js';
import { ensureMethod, successResponse, errorResponse, parseBody } from '../_lib/response.js';
import { getAuthenticatedUser, requireRole } from '../_lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!ensureMethod(req, res, ['GET', 'POST'])) return;

  // ─────────────────────────────────────────────────────────────────────────────
  // GET: Query Attendance Records
  // Supports:
  // - ?date=YYYY-MM-DD (records for specific day)
  // - ?month=YYYY-MM (records for entire month)
  // - ?staff_id=UUID (records for specific staff, optionally with date)
  // ─────────────────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    try {
      const user = await getAuthenticatedUser(req);
      const isAdmin = user && user.role === 'admin';

      const date = typeof req.query.date === 'string' ? req.query.date.trim() : undefined;
      const month = typeof req.query.month === 'string' ? req.query.month.trim() : undefined;
      const staffId = typeof req.query.staff_id === 'string' ? req.query.staff_id.trim() : undefined;

      // Unauthenticated or non-admin users can ONLY look up a single staff_id + date (for kiosk self-check)
      if (!isAdmin) {
        if (staffId && date) {
          const rows = await sql`
            SELECT id, staff_id, date, status, clock_in, clock_out, notes
            FROM public.attendance
            WHERE staff_id = ${staffId} AND date = ${date}::date
            LIMIT 1
          `;
          return successResponse(res, rows[0] || null);
        }
        return errorResponse(res, 'Unauthorized to view attendance reports.', 401);
      }

      // Admin Queries:
      // 1. Specific Staff and Date
      if (staffId && date) {
        const rows = await sql`
          SELECT id, staff_id, date, status, clock_in, clock_out, notes, marked_by, created_at
          FROM public.attendance
          WHERE staff_id = ${staffId} AND date = ${date}::date
          LIMIT 1
        `;
        return successResponse(res, rows[0] || null);
      }

      // 2. Month Range Query (e.g. 2026-09)
      if (month) {
        const startDate = `${month}-01`;
        const rows = await sql`
          SELECT id, staff_id, date::text as date, status, clock_in, clock_out, notes
          FROM public.attendance
          WHERE date >= ${startDate}::date 
            AND date < (${startDate}::date + INTERVAL '1 month')
          ORDER BY date ASC
        `;
        return successResponse(res, rows);
      }

      // 3. Single Date Query (default today if not specified)
      const targetDate = date || new Date().toISOString().split('T')[0];
      const rows = await sql`
        SELECT id, staff_id, date::text as date, status, clock_in, clock_out, notes, marked_by
        FROM public.attendance
        WHERE date = ${targetDate}::date
        ORDER BY created_at ASC
      `;
      return successResponse(res, rows);
    } catch (err: any) {
      console.error('Error querying attendance:', err);
      return errorResponse(res, 'Failed to query attendance.', 500, { message: err.message });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // POST: Admin Attendance Override / Manual Marking
  // ─────────────────────────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const user = await requireRole(req, res, ['admin']);
    if (!user) return;

    try {
      const body = parseBody<{
        staff_id?: string;
        date?: string;
        status?: string;
        clock_in?: string | null;
        clock_out?: string | null;
        notes?: string | null;
      }>(req);

      if (!body.staff_id || typeof body.staff_id !== 'string') {
        return errorResponse(res, 'Staff ID is required.', 400);
      }
      if (!body.date || typeof body.date !== 'string') {
        return errorResponse(res, 'Date is required (YYYY-MM-DD).', 400);
      }
      if (!body.status || !['present', 'absent', 'half-day', 'leave'].includes(body.status.toLowerCase())) {
        return errorResponse(res, 'Invalid attendance status. Allowed: present, absent, half-day, leave.', 400);
      }

      const staffId = body.staff_id.trim();
      const date = body.date.trim();
      const status = body.status.toLowerCase();
      const clockIn = body.clock_in ? body.clock_in : null;
      const clockOut = body.clock_out ? body.clock_out : null;
      const notes = body.notes && typeof body.notes === 'string' ? body.notes.trim() : null;

      // Verify staff member exists
      const staffCheck = await sql`
        SELECT id FROM public.staff WHERE id = ${staffId}
      `;
      if (staffCheck.length === 0) {
        return errorResponse(res, 'Staff member not found.', 404);
      }

      // Upsert attendance record on (staff_id, date)
      const rows = await sql`
        INSERT INTO public.attendance (
          staff_id, date, status, clock_in, clock_out, notes, marked_by
        ) VALUES (
          ${staffId}, ${date}::date, ${status}, ${clockIn}, ${clockOut}, ${notes}, ${user.id}
        )
        ON CONFLICT (staff_id, date)
        DO UPDATE SET
          status = EXCLUDED.status,
          clock_in = COALESCE(EXCLUDED.clock_in, public.attendance.clock_in),
          clock_out = COALESCE(EXCLUDED.clock_out, public.attendance.clock_out),
          notes = COALESCE(EXCLUDED.notes, public.attendance.notes),
          marked_by = EXCLUDED.marked_by
        RETURNING *
      `;

      return successResponse(res, rows[0]);
    } catch (err: any) {
      console.error('Error saving attendance record:', err);
      return errorResponse(res, 'Failed to save attendance record.', 500, { message: err.message });
    }
  }
}
