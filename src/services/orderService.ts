import { api } from './api'
import type { StructuredOrderItem } from '../lib/retail'

export interface CreateOrderInput {
  customerName: string
  phone: string
  address: string
  items: StructuredOrderItem[]
  shipping: number
  status?: string
  orderMode?: 'online' | 'offline'
  orderType?: 'online_request' | 'pos_sale' | 'manual_sale'
  deliveryCharge?: number
  discountAmount?: number
  manualDiscountAmount?: number
  manualDiscountType?: 'flat' | 'percent'
  manualDiscountValue?: number
  couponCode?: string
  couponPercentage?: number

  // POS additions
  paymentMethod?: string
  splitDetails?: Record<string, unknown>
  totalGst?: number
  gstEnabled?: boolean
  remarks?: string
  referenceNumber?: string
  billingDate?: string
  tailorName?: string
}

export interface CreatedOrder {
  orderId: string
  invoiceNo: string
  createdAt: string
  order?: any
}

export interface OrderQueryParams {
  invoiceNo?: string
  phone?: string
  customerName?: string
  status?: string
  orderMode?: string
  orderType?: string
  startDate?: string
  endDate?: string
  limit?: number
  offset?: number
  includeItems?: boolean
}

/**
 * Creates an order atomically with server-side price validation and stock deduction.
 */
export const createOrderWithStock = async (input: CreateOrderInput): Promise<CreatedOrder> => {
  const customerName = input.customerName.trim() || 'Customer'
  const phone = input.phone.trim()
  const address = input.address.trim()
  const shipping = Number(input.shipping || 0)
  const status = input.status || 'pending'
  const orderMode = input.orderMode || 'online'
  const orderType = input.orderType || (status === 'pending' && orderMode === 'online' ? 'online_request' : 'pos_sale')
  const deliveryCharge = Number(input.deliveryCharge || 0)
  const discountAmount = Number(input.discountAmount || 0)
  const manualDiscountAmount = Number(input.manualDiscountAmount || 0)
  const manualDiscountType = input.manualDiscountType || 'flat'
  const manualDiscountValue = Number(input.manualDiscountValue || 0)
  const couponCode = input.couponCode?.trim() || null
  const couponPercentage = Number(input.couponPercentage || 0)
  const totalGst = Number(input.totalGst || 0)
  const gstEnabled = Boolean(input.gstEnabled)
  const paymentMethod = input.paymentMethod || 'cash'
  const splitDetails = input.splitDetails || {}

  const payload = {
    customerName,
    phone,
    address,
    items: input.items,
    shipping,
    status,
    orderMode,
    orderType,
    deliveryCharge,
    discountAmount,
    manualDiscountAmount,
    manualDiscountType,
    manualDiscountValue,
    couponCode,
    couponPercentage,
    totalGst,
    gstEnabled,
    paymentMethod,
    splitDetails,
    remarks: input.remarks,
    referenceNumber: input.referenceNumber,
    billingDate: input.billingDate,
  }

  try {
    const result = await api.createOrder(payload)
    const orderId = String(result?.orderId || result?.order_id || result?.order?.id || '')
    const invoiceNo = String(result?.invoiceNo || result?.invoice_no || result?.order?.invoice_no || '')
    const createdAt = String(result?.createdAt || result?.created_at || new Date().toISOString())

    if (!orderId || !invoiceNo) {
      throw new Error('Server returned an invalid order creation response.')
    }

    return {
      orderId,
      invoiceNo,
      createdAt,
      order: result?.order,
    }
  } catch (err: any) {
    const msg = err instanceof Error ? err.message : String(err?.message || err || 'Failed to create order')
    throw new Error(msg)
  }
}

/**
 * Fetch orders for staff/admin with optional filters.
 */
export const getOrders = async (params: OrderQueryParams = {}): Promise<any[]> => {
  const query = new URLSearchParams()
  if (params.invoiceNo) query.set('invoiceNo', params.invoiceNo)
  if (params.phone) query.set('phone', params.phone)
  if (params.customerName) query.set('customerName', params.customerName)
  if (params.status) query.set('status', params.status)
  if (params.orderMode) query.set('orderMode', params.orderMode)
  if (params.orderType) query.set('orderType', params.orderType)
  if (params.startDate) query.set('startDate', params.startDate)
  if (params.endDate) query.set('endDate', params.endDate)
  if (params.limit) query.set('limit', String(params.limit))
  if (params.offset) query.set('offset', String(params.offset))
  if (params.includeItems) query.set('includeItems', 'true')

  return api.getOrders(query.toString())
}

/**
 * Fetch orders belonging to the logged-in customer.
 */
export const getMyOrders = async (): Promise<any[]> => {
  return api.getMyOrders()
}

/**
 * Retrieve an order or digital invoice by ID or invoice number.
 */
export const getOrderById = async (id: string, isPublic = false): Promise<any> => {
  return api.getOrderById(id, isPublic)
}

/**
 * Update an order's metadata.
 */
export const updateOrder = async (id: string, payload: Record<string, unknown>): Promise<any> => {
  return api.updateOrder(id, payload)
}

/**
 * Update an order's status with server-side validation and stock guards.
 */
export const updateOrderStatus = async (id: string, status: string): Promise<any> => {
  return api.updateOrderStatus(id, status)
}

/**
 * Delete an order (Admin / Staff).
 */
export const deleteOrder = async (id: string): Promise<{ message: string }> => {
  return api.deleteOrder(id)
}

/**
 * Update the invoice PDF reference URL for an order.
 */
export const updateInvoicePdf = async (id: string, url: string): Promise<any> => {
  return api.updateInvoicePdf(id, url)
}

/**
 * Retrieve order analytics for dashboard and reporting.
 */
export const getOrderAnalytics = async (): Promise<any> => {
  return api.getOrderAnalytics()
}

export const orderService = {
  createOrderWithStock,
  getOrders,
  getMyOrders,
  getOrderById,
  updateOrder,
  updateOrderStatus,
  deleteOrder,
  updateInvoicePdf,
  getOrderAnalytics,
}
