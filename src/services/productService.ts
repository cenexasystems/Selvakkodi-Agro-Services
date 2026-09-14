/**
 * productService.ts
 * Communicates with the Vercel Serverless API (/api/products & /api/categories)
 * backed by Neon PostgreSQL.
 */
import { api } from './api'
import { categoryService } from './categoryService'

export async function fetchAllCategories(): Promise<{ data: Array<{ id: string | number; name_en: string }>; error: string | null }> {
  try {
    const res = await categoryService.fetchCategories()
    if (res.error) {
      return { data: [], error: res.error }
    }
    return {
      data: res.data.map(c => ({ id: c.id, name_en: c.name_en })),
      error: null,
    }
  } catch (err: any) {
    return { data: [], error: err.message || 'Failed to fetch categories' }
  }
}

export function normalizeProduct(p: any): any {
  if (!p || typeof p !== 'object') return p
  const rawPrice = p.price ?? p.rate ?? p.selling_price ?? p.unit_price
  const priceNum = rawPrice !== null && rawPrice !== undefined && rawPrice !== '' ? Number(rawPrice) : 0
  const price = Number.isFinite(priceNum) ? priceNum : 0

  const rawPurchase = p.purchase_price ?? p.cost_price
  const purchaseNum = rawPurchase !== null && rawPurchase !== undefined && rawPurchase !== '' ? Number(rawPurchase) : 0
  const purchase_price = Number.isFinite(purchaseNum) ? purchaseNum : 0

  const rawStock = p.stock_quantity ?? p.stock
  const stockNum = rawStock !== null && rawStock !== undefined && rawStock !== '' ? Number(rawStock) : 0
  const stock_quantity = Number.isFinite(stockNum) ? stockNum : 0

  const rawAlert = p.low_stock_alert
  const alertNum = rawAlert !== null && rawAlert !== undefined && rawAlert !== '' ? Number(rawAlert) : 5
  const low_stock_alert = Number.isFinite(alertNum) ? alertNum : 5

  return {
    ...p,
    price,
    purchase_price,
    stock_quantity,
    low_stock_alert,
  }
}

export async function fetchAllProducts(): Promise<{ data: any[]; error: string | null }> {
  try {
    const products = await api.getProducts()
    return { data: (products || []).map(normalizeProduct), error: null }
  } catch (err: any) {
    return { data: [], error: err.message || 'Failed to fetch products' }
  }
}

export async function fetchProductById(id: string | number): Promise<{ data: any | null; error: string | null }> {
  try {
    const product = await api.getProductById(id)
    return { data: product ? normalizeProduct(product) : null, error: null }
  } catch (err: any) {
    return { data: null, error: err.message || 'Failed to fetch product' }
  }
}

export async function createProduct(payload: Record<string, unknown>): Promise<{ data: any | null; error: string | null }> {
  try {
    const product = await api.createProduct(payload)
    return { data: product ? normalizeProduct(product) : null, error: null }
  } catch (err: any) {
    return { data: null, error: err.message || 'Failed to create product' }
  }
}

export async function updateProduct(
  id: string | number,
  payload: Record<string, unknown>
): Promise<{ data: any | null; error: string | null }> {
  try {
    const product = await api.updateProduct(id, payload)
    return { data: product ? normalizeProduct(product) : null, error: null }
  } catch (err: any) {
    return { data: null, error: err.message || 'Failed to update product' }
  }
}

export async function deleteProduct(
  id: string | number,
  permanent = false
): Promise<{ error: string | null }> {
  try {
    await api.deleteProduct(id, permanent)
    return { error: null }
  } catch (err: any) {
    return { error: err.message || 'Failed to delete product' }
  }
}

export async function fetchInventoryLogs(params?: {
  from?: string
  to?: string
  productId?: number | string
  reason?: string
  limit?: number
}): Promise<{ data: any[]; error: string | null }> {
  try {
    const logs = await api.getInventoryLogs(params)
    return { data: logs || [], error: null }
  } catch (err: any) {
    return { data: [], error: err.message || 'Failed to fetch inventory logs' }
  }
}

export async function createInventoryLog(payload: {
  product_id: number | string
  old_quantity: number
  new_quantity: number
  adjustment: number
  reason: string
  adjustment_type?: string | null
  note?: string | null
  reference_id?: string | null
}): Promise<{ data: any | null; error: string | null }> {
  try {
    const log = await api.createInventoryLog(payload)
    return { data: log, error: null }
  } catch (err: any) {
    return { data: null, error: err.message || 'Failed to record inventory log' }
  }
}
