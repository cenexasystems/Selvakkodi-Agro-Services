export type AppliedCoupon = {
  id?: number | string
  code: string
  percentage: number
  discount: number
  min_order_value?: number
}

export interface Coupon {
  id: number | string
  code: string
  percentage: number
  is_active: boolean
  expiry_date: string | null
  usage_limit: number | null
  usage_count: number
  min_order_value: number
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

export async function validateCoupon(
  rawCode: string,
  subtotal: number
): Promise<{ data: AppliedCoupon | null; error: string | null }> {
  const code = rawCode.trim().toUpperCase()
  if (!code) {
    return { data: null, error: 'Please enter a coupon code' }
  }

  try {
    const res = await fetch('/api/coupons/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ code, subtotal }),
    })

    const json = await res.json().catch(() => ({}))

    if (!res.ok || !json.success) {
      return {
        data: null,
        error: json.error || json.message || 'Invalid or expired coupon code',
      }
    }

    const d = json.data
    return {
      data: {
        id: d.id,
        code: d.code,
        percentage: Number(d.percentage),
        discount: Number(d.discount),
        min_order_value: Number(d.min_order_value || 0),
      },
      error: null,
    }
  } catch (err: any) {
    console.error('Coupon validation network error:', err)
    return { data: null, error: 'Failed to validate coupon. Please try again.' }
  }
}

export async function fetchCoupons(): Promise<{ data: Coupon[]; error: string | null }> {
  try {
    const res = await fetch('/api/coupons', {
      method: 'GET',
      headers: getAuthHeaders(),
      credentials: 'include',
    })

    const json = await res.json().catch(() => ({}))
    if (!res.ok || !json.success) {
      return { data: [], error: json.error || 'Failed to fetch coupons' }
    }

    return { data: (json.data || []) as Coupon[], error: null }
  } catch (err: any) {
    console.error('Fetch coupons network error:', err)
    return { data: [], error: err.message || 'Failed to fetch coupons' }
  }
}

export async function createCoupon(payload: {
  code: string
  percentage: number
  is_active?: boolean
  expiry_date?: string | null
  usage_limit?: number | null
  min_order_value?: number
}): Promise<{ data: Coupon | null; error: string | null }> {
  try {
    const res = await fetch('/api/coupons', {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify(payload),
    })

    const json = await res.json().catch(() => ({}))
    if (!res.ok || !json.success) {
      return { data: null, error: json.error || json.message || 'Failed to create coupon' }
    }

    return { data: json.data as Coupon, error: null }
  } catch (err: any) {
    console.error('Create coupon error:', err)
    return { data: null, error: err.message || 'Failed to create coupon' }
  }
}

export async function updateCoupon(
  id: number | string,
  payload: Partial<Coupon>
): Promise<{ data: Coupon | null; error: string | null }> {
  try {
    const res = await fetch(`/api/coupons/${id}`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify(payload),
    })

    const json = await res.json().catch(() => ({}))
    if (!res.ok || !json.success) {
      return { data: null, error: json.error || json.message || 'Failed to update coupon' }
    }

    return { data: json.data as Coupon, error: null }
  } catch (err: any) {
    console.error('Update coupon error:', err)
    return { data: null, error: err.message || 'Failed to update coupon' }
  }
}

export async function deleteCoupon(id: number | string): Promise<{ error: string | null }> {
  try {
    const res = await fetch(`/api/coupons/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
      credentials: 'include',
    })

    const json = await res.json().catch(() => ({}))
    if (!res.ok || !json.success) {
      return { error: json.error || json.message || 'Failed to delete coupon' }
    }

    return { error: null }
  } catch (err: any) {
    console.error('Delete coupon error:', err)
    return { error: err.message || 'Failed to delete coupon' }
  }
}

export async function toggleCouponActive(coupon: Coupon): Promise<{ error: string | null }> {
  return updateCoupon(coupon.id, { is_active: !coupon.is_active }).then((res) => ({
    error: res.error,
  }))
}

export const couponService = {
  fetchCoupons,
  validateCoupon,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  toggleCouponActive,
}
