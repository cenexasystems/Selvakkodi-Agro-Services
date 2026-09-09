export interface CustomerReview {
  id: string
  user_id?: string | null
  name: string
  location: string
  rating: number
  text: string
  review_text?: string
  product_id?: number | null
  is_approved?: boolean
  createdAt: string
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

export async function fetchReviews(options?: {
  productId?: string | number
  all?: boolean
  limit?: number
}): Promise<{ data: CustomerReview[]; error: string | null }> {
  try {
    const params = new URLSearchParams()
    if (options?.productId) params.append('product_id', String(options.productId))
    if (options?.all) params.append('all', 'true')
    if (options?.limit) params.append('limit', String(options.limit))

    const url = `/api/reviews${params.toString() ? `?${params.toString()}` : ''}`
    const res = await fetch(url, {
      headers: getAuthHeaders(),
      credentials: 'include',
    })

    const json = await res.json().catch(() => ({}))
    if (!res.ok || !json.success) {
      return { data: [], error: json.error || 'Failed to fetch reviews' }
    }

    const list: CustomerReview[] = (json.data || []).map((r: any) => ({
      id: String(r.id),
      user_id: r.user_id,
      name: String(r.name || 'Customer'),
      location: String(r.location || 'Tamil Nadu'),
      rating: Number(r.rating || 5),
      text: String(r.review_text || r.text || ''),
      review_text: String(r.review_text || r.text || ''),
      product_id: r.product_id ? Number(r.product_id) : null,
      is_approved: r.is_approved !== undefined ? Boolean(r.is_approved) : true,
      createdAt: String(r.created_at || new Date().toISOString()),
      created_at: String(r.created_at || new Date().toISOString()),
    }))

    return { data: list, error: null }
  } catch (err: any) {
    return { data: [], error: err.message || 'Network error fetching reviews' }
  }
}

export async function createReview(payload: {
  name: string
  location?: string
  rating: number
  text: string
  product_id?: number | string
}): Promise<{ data: CustomerReview | null; error: string | null }> {
  try {
    const res = await fetch('/api/reviews', {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify({
        name: payload.name,
        location: payload.location,
        rating: payload.rating,
        review_text: payload.text,
        product_id: payload.product_id,
      }),
    })

    const json = await res.json().catch(() => ({}))
    if (!res.ok || !json.success) {
      return { data: null, error: json.error || 'Failed to submit review' }
    }

    const r = json.data
    const created: CustomerReview = {
      id: String(r.id),
      user_id: r.user_id,
      name: String(r.name),
      location: String(r.location || 'Tamil Nadu'),
      rating: Number(r.rating),
      text: String(r.review_text || ''),
      review_text: String(r.review_text || ''),
      product_id: r.product_id ? Number(r.product_id) : null,
      is_approved: Boolean(r.is_approved),
      createdAt: String(r.created_at),
      created_at: String(r.created_at),
    }

    return { data: created, error: null }
  } catch (err: any) {
    return { data: null, error: err.message || 'Network error submitting review' }
  }
}

export async function moderateReview(
  id: string,
  is_approved: boolean
): Promise<{ success: boolean; error: string | null }> {
  try {
    const res = await fetch(`/api/reviews/${id}`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      credentials: 'include',
      body: JSON.stringify({ is_approved }),
    })

    const json = await res.json().catch(() => ({}))
    if (!res.ok || !json.success) {
      return { success: false, error: json.error || 'Failed to moderate review' }
    }

    return { success: true, error: null }
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error moderating review' }
  }
}

export async function deleteReview(id: string): Promise<{ success: boolean; error: string | null }> {
  try {
    const res = await fetch(`/api/reviews/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
      credentials: 'include',
    })

    const json = await res.json().catch(() => ({}))
    if (!res.ok || !json.success) {
      return { success: false, error: json.error || 'Failed to delete review' }
    }

    return { success: true, error: null }
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error deleting review' }
  }
}

export const reviewService = {
  fetchReviews,
  createReview,
  moderateReview,
  deleteReview,
}
