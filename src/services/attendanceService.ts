export interface AttendanceRecord {
  id: string
  staff_id: string
  date: string
  status: string
  clock_in: string | null
  clock_out: string | null
  notes?: string | null
  marked_by?: string | null
  created_at?: string
}

function getAuthHeaders(): HeadersInit {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  }
  const token =
    localStorage.getItem('selvakkodi_auth_token') ||
    localStorage.getItem('selvakkodi-admin-token') ||
    localStorage.getItem('purple-boutique-token')
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  return headers
}

export async function fetchAttendanceByDate(date: string): Promise<{ data: AttendanceRecord[]; error: string | null }> {
  try {
    const res = await fetch(`/api/attendance?date=${encodeURIComponent(date)}`, {
      headers: getAuthHeaders(),
      credentials: 'include',
    })

    const json = await res.json().catch(() => ({}))
    if (!res.ok || !json.success) {
      return { data: [], error: json.error || 'Failed to fetch attendance' }
    }

    return { data: json.data || [], error: null }
  } catch (err: any) {
    return { data: [], error: err.message || 'Network error fetching attendance' }
  }
}

export async function fetchAttendanceByMonth(month: string): Promise<{ data: AttendanceRecord[]; error: string | null }> {
  try {
    const res = await fetch(`/api/attendance?month=${encodeURIComponent(month)}`, {
      headers: getAuthHeaders(),
      credentials: 'include',
    })

    const json = await res.json().catch(() => ({}))
    if (!res.ok || !json.success) {
      return { data: [], error: json.error || 'Failed to fetch monthly attendance report' }
    }

    return { data: json.data || [], error: null }
  } catch (err: any) {
    return { data: [], error: err.message || 'Network error fetching monthly report' }
  }
}

export async function fetchStaffAttendanceForDate(
  staffId: string,
  date: string
): Promise<{ data: AttendanceRecord | null; error: string | null }> {
  try {
    const res = await fetch(`/api/attendance?staff_id=${encodeURIComponent(staffId)}&date=${encodeURIComponent(date)}`, {
      headers: getAuthHeaders(),
      credentials: 'include',
    })

    const json = await res.json().catch(() => ({}))
    if (!res.ok || !json.success) {
      return { data: null, error: json.error || 'Failed to fetch attendance record' }
    }

    return { data: json.data || null, error: null }
  } catch (err: any) {
    return { data: null, error: err.message || 'Network error fetching attendance record' }
  }
}

export async function markAttendance(payload: {
  staff_id: string
  date: string
  status: string
  clock_in?: string | null
  clock_out?: string | null
  notes?: string | null
}): Promise<{ data: AttendanceRecord | null; error: string | null }> {
  try {
    const res = await fetch('/api/attendance', {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify(payload),
    })

    const json = await res.json().catch(() => ({}))
    if (!res.ok || !json.success) {
      return { data: null, error: json.error || 'Failed to save attendance' }
    }

    return { data: json.data, error: null }
  } catch (err: any) {
    return { data: null, error: err.message || 'Network error saving attendance' }
  }
}

export async function punchAttendance(
  staff_id: string,
  action: 'punch_in' | 'punch_out'
): Promise<{ data: { message: string; record: AttendanceRecord } | null; error: string | null }> {
  try {
    const res = await fetch('/api/attendance/punch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ staff_id, action }),
    })

    const json = await res.json().catch(() => ({}))
    if (!res.ok || !json.success) {
      return { data: null, error: json.error || 'Failed to record punch' }
    }

    return { data: json.data, error: null }
  } catch (err: any) {
    return { data: null, error: err.message || 'Network error recording punch' }
  }
}

export const attendanceService = {
  fetchAttendanceByDate,
  fetchAttendanceByMonth,
  fetchStaffAttendanceForDate,
  markAttendance,
  punchAttendance,
}
