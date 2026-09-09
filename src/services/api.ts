export interface ApiProduct {
  id: number
  name: string
  name_ta?: string
  category: string
  remedy?: string[]
  price: number
  offer_price?: number
  offerPrice?: number
  unit?: string
  rating?: number
  description: string
  description_ta?: string
  benefits: string
  benefits_ta?: string
  image?: string
  image_url?: string
  imageUrl?: string
  stock: number
}

export interface ApiInventoryLog {
  id: string
  product_id: number | string
  old_quantity: number
  new_quantity: number
  adjustment: number
  reason: string
  reference_id?: string | null
  created_at: string
  created_by?: string | null
  products?: { name: string; category: string }
}

export interface LoginPayload {
  email: string
  password: string
}

export interface RegisterPayload {
  name: string
  email: string
  password: string
}

export interface AuthResponse {
  token: string
  user: {
    id: number
    name: string
    email: string
    role: 'admin' | 'customer'
  }
}

const API_URL = (import.meta.env.VITE_API_URL && !import.meta.env.VITE_API_URL.includes('localhost:5000'))
  ? import.meta.env.VITE_API_URL
  : '/api'

function getHeaders(auth = false): HeadersInit {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  }

  if (auth) {
    const token = localStorage.getItem('selvakkodi_auth_token')
      || localStorage.getItem('selvakkodi-admin-token')
      || localStorage.getItem('purple-boutique-token')
    if (token) {
      headers.Authorization = `Bearer ${token}`
    }
  }

  return headers
}

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response

  try {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`
    response = await fetch(`${API_URL}${normalizedPath}`, {
      ...options,
      credentials: 'include',
    })
  } catch {
    throw new Error('Unable to reach the server. Please check your connection and try again.')
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ message: 'Request failed' }))
    throw new Error(payload.error || payload.message || 'Service is temporarily unavailable. Please try again.')
  }

  const result = await response.json()
  return (result && typeof result === 'object' && 'data' in result && result.success !== false)
    ? result.data
    : result
}

export const api = {
  health: () => request<{ status: string; service: string }>('/health'),

  register: (payload: RegisterPayload) =>
    request<AuthResponse>('/auth/register', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    }),

  login: (payload: LoginPayload) =>
    request<AuthResponse>('/auth/login', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    }),

  me: () =>
    request<AuthResponse['user']>('/auth/me', {
      method: 'GET',
      headers: getHeaders(true),
    }),

  getProducts: (query?: string) => request<any[]>(`/products${query ? `?${query}` : ''}`),

  getProductById: (id: number | string) => request<any>(`/products/${id}`),

  createProduct: (payload: Record<string, unknown>) =>
    request<any>('/products', {
      method: 'POST',
      headers: getHeaders(true),
      body: JSON.stringify(payload),
    }),

  updateProduct: (id: number | string, payload: Record<string, unknown>) =>
    request<any>(`/products/${id}`, {
      method: 'PUT',
      headers: getHeaders(true),
      body: JSON.stringify(payload),
    }),

  deleteProduct: (id: number | string, permanent = false) =>
    request<{ message: string }>(`/products/${id}${permanent ? '?permanent=true' : ''}`, {
      method: 'DELETE',
      headers: getHeaders(true),
    }),

  // Categories
  getCategories: (query?: string) => request<any[]>(`/categories${query ? `?${query}` : ''}`),

  createCategory: (payload: Record<string, unknown>) =>
    request<any>('/categories', {
      method: 'POST',
      headers: getHeaders(true),
      body: JSON.stringify(payload),
    }),

  updateCategory: (id: number | string, payload: Record<string, unknown>) =>
    request<any>(`/categories/${id}`, {
      method: 'PUT',
      headers: getHeaders(true),
      body: JSON.stringify(payload),
    }),

  deleteCategory: (id: number | string) =>
    request<{ message: string }>(`/categories/${id}`, {
      method: 'DELETE',
      headers: getHeaders(true),
    }),

  // Variants
  getVariants: (query?: string) => request<any[]>(`/variants${query ? `?${query}` : ''}`),

  createVariant: (payload: Record<string, unknown>) =>
    request<any>('/variants', {
      method: 'POST',
      headers: getHeaders(true),
      body: JSON.stringify(payload),
    }),

  updateVariant: (id: string, payload: Record<string, unknown>) =>
    request<any>(`/variants/${id}`, {
      method: 'PUT',
      headers: getHeaders(true),
      body: JSON.stringify(payload),
    }),

  deleteVariant: (id: string, permanent = false) =>
    request<{ message: string }>(`/variants/${id}${permanent ? '?permanent=true' : ''}`, {
      method: 'DELETE',
      headers: getHeaders(true),
    }),

  setDefaultVariant: (variantId: string, productId: string | number) =>
    request<any>('/variants/default', {
      method: 'PUT',
      headers: getHeaders(true),
      body: JSON.stringify({ variantId, productId }),
    }),

  // Settings
  getSettings: () => request<any>('/settings'),

  updateSettings: (payload: Record<string, unknown>) =>
    request<any>('/settings', {
      method: 'PUT',
      headers: getHeaders(true),
      body: JSON.stringify(payload),
    }),

  // Notifications
  getNotifications: () =>
    request<any[]>('/notifications', {
      method: 'GET',
      headers: getHeaders(true),
    }),

  createNotification: (payload: { title: string; message: string; type?: string; role_target?: string; user_id?: string; data?: Record<string, unknown> }) =>
    request<any>('/notifications', {
      method: 'POST',
      headers: getHeaders(true),
      body: JSON.stringify(payload),
    }),

  markNotificationRead: (id: string, is_read = true) =>
    request<any>(`/notifications/${id}`, {
      method: 'PATCH',
      headers: getHeaders(true),
      body: JSON.stringify({ is_read }),
    }),

  markAllNotificationsRead: () =>
    request<any>('/notifications/mark-read', {
      method: 'POST',
      headers: getHeaders(true),
    }),

  getFavorites: () =>
    request<ApiProduct[]>('/products/user/favorites/list', {
      method: 'GET',
      headers: getHeaders(true),
    }),

  addFavorite: (productId: number) =>
    request<{ message: string }>('/products/user/favorites', {
      method: 'POST',
      headers: getHeaders(true),
      body: JSON.stringify({ productId }),
    }),

  removeFavorite: (productId: number) =>
    request<{ message: string }>(`/products/user/favorites/${productId}`, {
      method: 'DELETE',
      headers: getHeaders(true),
    }),

  // Orders
  createOrder: (payload: Record<string, unknown> | Array<{ productId: number; quantity: number }>) => {
    const body = Array.isArray(payload) ? { items: payload } : payload
    return request<any>('/orders', {
      method: 'POST',
      headers: getHeaders(true),
      body: JSON.stringify(body),
    })
  },

  getOrders: (query?: string) =>
    request<any[]>(`/orders${query ? `?${query}` : ''}`, {
      method: 'GET',
      headers: getHeaders(true),
    }),

  getMyOrders: () =>
    request<any[]>('/orders/mine', {
      method: 'GET',
      headers: getHeaders(true),
    }),

  getOrderById: (id: string, isPublic = false) =>
    request<any>(`/orders/${encodeURIComponent(id)}${isPublic ? '?public=true' : ''}`, {
      method: 'GET',
      headers: getHeaders(true),
    }),

  updateOrder: (id: string, payload: Record<string, unknown>) =>
    request<any>(`/orders/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: getHeaders(true),
      body: JSON.stringify(payload),
    }),

  updateOrderStatus: (id: string, status: string) =>
    request<any>(`/orders/${encodeURIComponent(id)}/status`, {
      method: 'PUT',
      headers: getHeaders(true),
      body: JSON.stringify({ status }),
    }),

  deleteOrder: (id: string) =>
    request<{ message: string }>(`/orders/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: getHeaders(true),
    }),

  updateInvoicePdf: (id: string, url: string) =>
    request<any>(`/orders/${encodeURIComponent(id)}/invoice-pdf`, {
      method: 'PUT',
      headers: getHeaders(true),
      body: JSON.stringify({ url }),
    }),

  getOrderAnalytics: () =>
    request<any>('/orders/analytics', {
      method: 'GET',
      headers: getHeaders(true),
    }),

  getAllOrders: () =>
    request<any[]>('/orders', {
      method: 'GET',
      headers: getHeaders(true),
    }),

  getSummary: () =>
    request<any>('/orders/analytics', {
      method: 'GET',
      headers: getHeaders(true),
    }),

  // Advance Orders
  getAdvanceOrders: (query?: string) =>
    request<any[]>(`/advance-orders${query ? `?${query}` : ''}`, {
      method: 'GET',
      headers: getHeaders(true),
    }),

  getAdvanceOrderById: (id: string) =>
    request<any>(`/advance-orders/${encodeURIComponent(id)}`, {
      method: 'GET',
      headers: getHeaders(true),
    }),

  getAdvanceOrderHistory: (id: string) =>
    request<{ timeline: any[]; payments: any[] }>(`/advance-orders/${encodeURIComponent(id)}/history`, {
      method: 'GET',
      headers: getHeaders(true),
    }),

  createAdvanceOrder: (payload: Record<string, unknown>) =>
    request<any>('/advance-orders', {
      method: 'POST',
      headers: getHeaders(true),
      body: JSON.stringify(payload),
    }),

  updateAdvanceOrder: (id: string, payload: Record<string, unknown>) =>
    request<any>(`/advance-orders/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: getHeaders(true),
      body: JSON.stringify(payload),
    }),

  updateAdvanceOrderStatus: (id: string, status: string, remarks = '') =>
    request<any>(`/advance-orders/${encodeURIComponent(id)}/status`, {
      method: 'PUT',
      headers: getHeaders(true),
      body: JSON.stringify({ status, remarks }),
    }),

  addAdvanceOrderEvent: (id: string, eventType: string, label: string, remarks = '') =>
    request<any>(`/advance-orders/${encodeURIComponent(id)}/events`, {
      method: 'POST',
      headers: getHeaders(true),
      body: JSON.stringify({ eventType, label, remarks }),
    }),

  completeAdvanceOrder: (id: string, payload: Record<string, unknown>) =>
    request<{ order_id: string; invoice_no: string; completed_at: string }>(`/advance-orders/${encodeURIComponent(id)}/complete`, {
      method: 'POST',
      headers: getHeaders(true),
      body: JSON.stringify(payload),
    }),

  deleteAdvanceOrder: (id: string) =>
    request<{ message: string }>(`/advance-orders/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: getHeaders(true),
    }),

  // Inventory Logs
  getInventoryLogs: (params?: { from?: string; to?: string; productId?: number | string; reason?: string; limit?: number }) => {
    const query = new URLSearchParams()
    if (params?.from) query.set('from', params.from)
    if (params?.to) query.set('to', params.to)
    if (params?.productId) query.set('product_id', String(params.productId))
    if (params?.reason) query.set('reason', params.reason)
    if (params?.limit) query.set('limit', String(params.limit))
    const qs = query.toString()
    return request<ApiInventoryLog[]>(`/inventory/logs${qs ? `?${qs}` : ''}`, {
      method: 'GET',
      headers: getHeaders(true),
    })
  },

  createInventoryLog: (payload: {
    product_id: number | string
    old_quantity: number
    new_quantity: number
    adjustment: number
    reason: string
    reference_id?: string | null
  }) =>
    request<ApiInventoryLog>('/inventory/logs', {
      method: 'POST',
      headers: getHeaders(true),
      body: JSON.stringify(payload),
    }),
}
