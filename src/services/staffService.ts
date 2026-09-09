export interface Staff {
  id: string
  user_id?: string | null
  name: string
  role: string
  phone: string | null
  base_salary: number
  is_active: boolean
  created_at?: string
  updated_at?: string
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

export async function fetchStaff(options?: { activeOnly?: boolean }): Promise<{ data: Staff[]; error: string | null }> {
  try {
    const params = new URLSearchParams()
    if (options?.activeOnly) params.append('activeOnly', 'true')

    const url = `/api/staff${params.toString() ? `?${params.toString()}` : ''}`
    const res = await fetch(url, {
      headers: getAuthHeaders(),
      credentials: 'include',
    })

    const json = await res.json().catch(() => ({}))
    if (!res.ok || !json.success) {
      return { data: [], error: json.error || 'Failed to fetch staff' }
    }

    return { data: json.data || [], error: null }
  } catch (err: any) {
    return { data: [], error: err.message || 'Network error fetching staff' }
  }
}

export async function getStaffById(id: string): Promise<{ data: Staff | null; error: string | null }> {
  try {
    const res = await fetch(`/api/staff/${id}`, {
      headers: getAuthHeaders(),
      credentials: 'include',
    })

    const json = await res.json().catch(() => ({}))
    if (!res.ok || !json.success) {
      return { data: null, error: json.error || 'Staff member not found' }
    }

    return { data: json.data || null, error: null }
  } catch (err: any) {
    return { data: null, error: err.message || 'Network error fetching staff member' }
  }
}

export async function createStaff(payload: {
  name: string
  role: string
  phone?: string | null
  base_salary?: number
  is_active?: boolean
}): Promise<{ data: Staff | null; error: string | null }> {
  try {
    const res = await fetch('/api/staff', {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify(payload),
    })

    const json = await res.json().catch(() => ({}))
    if (!res.ok || !json.success) {
      return { data: null, error: json.error || 'Failed to create staff member' }
    }

    return { data: json.data, error: null }
  } catch (err: any) {
    return { data: null, error: err.message || 'Network error creating staff member' }
  }
}

export async function updateStaff(
  id: string,
  payload: Partial<{
    name: string
    role: string
    phone: string | null
    base_salary: number
    is_active: boolean
  }>
): Promise<{ data: Staff | null; error: string | null }> {
  try {
    const res = await fetch(`/api/staff/${id}`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify(payload),
    })

    const json = await res.json().catch(() => ({}))
    if (!res.ok || !json.success) {
      return { data: null, error: json.error || 'Failed to update staff member' }
    }

    return { data: json.data, error: null }
  } catch (err: any) {
    return { data: null, error: err.message || 'Network error updating staff member' }
  }
}

export async function deleteStaff(id: string): Promise<{ success: boolean; error: string | null }> {
  try {
    const res = await fetch(`/api/staff/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
      credentials: 'include',
    })

    const json = await res.json().catch(() => ({}))
    if (!res.ok || !json.success) {
      return { success: false, error: json.error || 'Failed to delete staff member' }
    }

    return { success: true, error: null }
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error deleting staff member' }
  }
}

export const staffService = {
  fetchStaff,
  getStaffById,
  createStaff,
  updateStaff,
  deleteStaff,
}
