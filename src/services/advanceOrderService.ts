import type { PaymentMethodType } from '../lib/paymentMethods'
import { api } from './api'

export type AdvanceStatus = 'pending_deposit' | 'ready_for_delivery' | 'waiting_final_payment' | 'completed' | 'cancelled'

export type AdvancePaymentMethod = string | PaymentMethodType

export type AdvanceOrder = {
  id: string
  deposit_id: string
  customer_name: string
  phone: string
  address: string
  product_name: string
  products: Array<Record<string, unknown>>
  category: string
  description: string
  total_amount: number
  deposit_amount: number
  remaining_balance: number
  expected_delivery_date: string
  status: AdvanceStatus
  remarks: string
  reference_number: string
  created_by_name: string
  created_at: string
  updated_at: string
  completed_at: string | null
  completed_order_id: string | null
  invoice_number: string | null
  final_payment_method: string | null
}

export type AdvanceTimeline = {
  id: number | string
  advance_order_id: string
  event_type: string
  label: string
  remarks: string
  created_at: string
}

export type AdvancePayment = {
  id: string
  advance_order_id: string
  payment_type: 'deposit' | 'remaining'
  amount: number
  payment_method: string
  remarks: string
  received_at: string
}

const STORAGE_ORDERS_KEY = 'purple_boutique_advance_orders_v1'
const STORAGE_TIMELINE_KEY = 'purple_boutique_advance_timeline_v1'
const STORAGE_PAYMENTS_KEY = 'purple_boutique_advance_payments_v1'

const loadLocalOrders = (): AdvanceOrder[] => {
  try {
    const raw = localStorage.getItem(STORAGE_ORDERS_KEY)
    return raw ? (JSON.parse(raw) as AdvanceOrder[]) : []
  } catch {
    return []
  }
}

const saveLocalOrders = (orders: AdvanceOrder[]) => {
  try {
    localStorage.setItem(STORAGE_ORDERS_KEY, JSON.stringify(orders))
  } catch { /* ignore */ }
}

const loadLocalTimeline = (): AdvanceTimeline[] => {
  try {
    const raw = localStorage.getItem(STORAGE_TIMELINE_KEY)
    return raw ? (JSON.parse(raw) as AdvanceTimeline[]) : []
  } catch {
    return []
  }
}

const saveLocalTimeline = (timeline: AdvanceTimeline[]) => {
  try {
    localStorage.setItem(STORAGE_TIMELINE_KEY, JSON.stringify(timeline))
  } catch { /* ignore */ }
}

const loadLocalPayments = (): AdvancePayment[] => {
  try {
    const raw = localStorage.getItem(STORAGE_PAYMENTS_KEY)
    return raw ? (JSON.parse(raw) as AdvancePayment[]) : []
  } catch {
    return []
  }
}

const saveLocalPayments = (payments: AdvancePayment[]) => {
  try {
    localStorage.setItem(STORAGE_PAYMENTS_KEY, JSON.stringify(payments))
  } catch { /* ignore */ }
}

const normalizeOrder = (row: Record<string, unknown>): AdvanceOrder => ({
  ...row,
  id: String(row.id || ''),
  deposit_id: String(row.deposit_id || ''),
  customer_name: String(row.customer_name || ''),
  phone: String(row.phone || ''),
  address: String(row.address || ''),
  product_name: String(row.product_name || ''),
  products: Array.isArray(row.products) ? (row.products as Array<Record<string, unknown>>) : [],
  category: String(row.category || ''),
  description: String(row.description || ''),
  total_amount: Number(row.total_amount || 0),
  deposit_amount: Number(row.deposit_amount || 0),
  remaining_balance: Number(row.remaining_balance ?? (Number(row.total_amount || 0) - Number(row.deposit_amount || 0))),
  expected_delivery_date: String(row.expected_delivery_date || ''),
  status: String(row.status || 'pending_deposit') as AdvanceStatus,
  remarks: String(row.remarks || ''),
  reference_number: String(row.reference_number || ''),
  created_by_name: String(row.created_by_name || ''),
  created_at: String(row.created_at || new Date().toISOString()),
  updated_at: String(row.updated_at || new Date().toISOString()),
  completed_at: row.completed_at ? String(row.completed_at) : null,
  completed_order_id: row.completed_order_id ? String(row.completed_order_id) : null,
  invoice_number: row.invoice_number ? String(row.invoice_number) : null,
  final_payment_method: row.final_payment_method ? String(row.final_payment_method) : null,
})

export async function listAdvanceOrders(): Promise<AdvanceOrder[]> {
  const local = loadLocalOrders()
  try {
    const data = await api.getAdvanceOrders()
    if (Array.isArray(data)) {
      const remote = data.map(row => normalizeOrder(row as Record<string, unknown>))
      saveLocalOrders(remote)
      return remote
    }
  } catch (err) {
    console.warn('[listAdvanceOrders] API fallback to local:', err)
  }
  return local
}

export async function getAdvanceOrderHistory(orderId: string): Promise<{ timeline: AdvanceTimeline[]; payments: AdvancePayment[] }> {
  const localTimeline = loadLocalTimeline().filter(t => t.advance_order_id === orderId)
  const localPayments = loadLocalPayments().filter(p => p.advance_order_id === orderId)

  try {
    const data = await api.getAdvanceOrderHistory(orderId)
    if (data && Array.isArray(data.timeline) && Array.isArray(data.payments)) {
      return {
        timeline: data.timeline as AdvanceTimeline[],
        payments: data.payments as AdvancePayment[],
      }
    }
  } catch (err) {
    console.warn('[getAdvanceOrderHistory] API fallback to local:', err)
  }

  return { timeline: localTimeline, payments: localPayments }
}

export async function createAdvanceOrder(input: {
  customerName: string
  phone: string
  address: string
  productName: string
  category: string
  description: string
  totalAmount: number
  depositAmount: number
  expectedDeliveryDate: string
  remarks: string
  referenceNumber: string
  paymentMethod: AdvancePaymentMethod
  createdByName: string
  products?: Array<Record<string, unknown>>
}): Promise<AdvanceOrder> {
  let createdOrder: AdvanceOrder | null = null

  try {
    const data = await api.createAdvanceOrder({
      customerName: input.customerName,
      phone: input.phone,
      address: input.address,
      productName: input.productName,
      category: input.category,
      description: input.description,
      totalAmount: input.totalAmount,
      depositAmount: input.depositAmount,
      expectedDeliveryDate: input.expectedDeliveryDate,
      remarks: input.remarks,
      referenceNumber: input.referenceNumber,
      paymentMethod: input.paymentMethod,
      createdByName: input.createdByName,
      products: input.products || [],
    })
    if (data) {
      createdOrder = normalizeOrder(data as Record<string, unknown>)
    }
  } catch (err) {
    console.error('[createAdvanceOrder] API error:', err)
    throw err
  }

  if (!createdOrder) {
    const now = new Date()
    const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
    const seq = String(Math.floor(1000 + Math.random() * 9000))
    const depositId = `DEP-${ymd}-${seq}`
    const orderId = crypto.randomUUID ? crypto.randomUUID() : `adv_${Date.now()}_${Math.random().toString(36).slice(2)}`

    createdOrder = {
      id: orderId,
      deposit_id: depositId,
      customer_name: input.customerName.trim(),
      phone: input.phone.trim(),
      address: input.address.trim(),
      product_name: input.productName.trim(),
      products: input.products || [{ name: input.productName, category: input.category, quantity: 1, base_price: input.totalAmount, line_total: input.totalAmount }],
      category: input.category.trim(),
      description: input.description.trim(),
      total_amount: Number(input.totalAmount),
      deposit_amount: Number(input.depositAmount),
      remaining_balance: Number(input.totalAmount) - Number(input.depositAmount),
      expected_delivery_date: input.expectedDeliveryDate,
      status: 'pending_deposit',
      remarks: input.remarks.trim(),
      reference_number: input.referenceNumber.trim(),
      created_by_name: input.createdByName,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
      completed_at: null,
      completed_order_id: null,
      invoice_number: null,
      final_payment_method: null,
    }

    const currentTimeline = loadLocalTimeline()
    currentTimeline.push(
      { id: Date.now(), advance_order_id: orderId, event_type: 'created', label: 'Deposit Created', remarks: input.remarks, created_at: now.toISOString() },
      { id: Date.now() + 1, advance_order_id: orderId, event_type: 'deposit_received', label: 'Deposit Received', remarks: `Received ₹${input.depositAmount} via ${String(input.paymentMethod).toLowerCase() === 'upi' ? 'QR' : String(input.paymentMethod).toUpperCase()}`, created_at: now.toISOString() }
    )
    saveLocalTimeline(currentTimeline)

    const currentPayments = loadLocalPayments()
    currentPayments.push({
      id: orderId + '_dep',
      advance_order_id: orderId,
      payment_type: 'deposit',
      amount: Number(input.depositAmount),
      payment_method: String(input.paymentMethod),
      remarks: input.remarks,
      received_at: now.toISOString(),
    })
    saveLocalPayments(currentPayments)
  }

  const localOrders = loadLocalOrders()
  const updated = [createdOrder, ...localOrders.filter(o => o.id !== createdOrder!.id)]
  saveLocalOrders(updated)
  return createdOrder
}

export async function updateAdvanceStatus(orderId: string, status: AdvanceStatus, remarks = ''): Promise<AdvanceOrder> {
  let updatedOrder: AdvanceOrder | null = null

  try {
    const data = await api.updateAdvanceOrderStatus(orderId, status, remarks)
    if (data) {
      updatedOrder = normalizeOrder(data as Record<string, unknown>)
    }
  } catch (err) {
    console.error('[updateAdvanceStatus] API error:', err)
    throw err
  }

  const localOrders = loadLocalOrders()
  const existing = localOrders.find(o => o.id === orderId)
  if (!updatedOrder && existing) {
    const now = new Date().toISOString()
    const label = status === 'ready_for_delivery' ? 'Order Prepared' : status === 'waiting_final_payment' ? 'Customer Contacted' : status === 'cancelled' ? 'Cancelled' : 'Pending Deposit'
    updatedOrder = { ...existing, status, remarks: remarks || existing.remarks, updated_at: now }

    const timeline = loadLocalTimeline()
    timeline.push({ id: Date.now(), advance_order_id: orderId, event_type: status, label, remarks, created_at: now })
    saveLocalTimeline(timeline)
  }

  if (updatedOrder) {
    saveLocalOrders(localOrders.map(o => o.id === orderId ? updatedOrder! : o))
    return updatedOrder
  }
  throw new Error('Order not found')
}

export async function addAdvanceEvent(orderId: string, eventType: string, label: string, remarks = '') {
  try {
    await api.addAdvanceOrderEvent(orderId, eventType, label, remarks)
  } catch (err) {
    console.warn('[addAdvanceEvent] API error, saving locally:', err)
  }
  const timeline = loadLocalTimeline()
  timeline.push({ id: Date.now(), advance_order_id: orderId, event_type: eventType, label, remarks, created_at: new Date().toISOString() })
  saveLocalTimeline(timeline)
}

export async function completeAdvanceOrder(
  orderId: string, 
  paymentMethod: AdvancePaymentMethod, 
  finalAmount: number,
  couponCode: string | null = null,
  couponPercentage: number = 0,
  manualDiscountAmount: number = 0,
  remarks = ''
): Promise<{ order_id: string; invoice_no: string; completed_at: string }> {
  let result: { order_id: string; invoice_no: string; completed_at: string } | null = null

  try {
    const data = await api.completeAdvanceOrder(orderId, {
      paymentMethod,
      finalAmount,
      couponCode,
      couponPercentage,
      manualDiscount: manualDiscountAmount,
      remarks,
    })
    if (data && data.order_id && data.invoice_no) {
      result = data
    }
  } catch (err: any) {
    console.error('[completeAdvanceOrder] API error:', err)
    alert(`Backend Error: ${err.message || 'Failed to complete advance order'}`)
    throw err
  }

  const localOrders = loadLocalOrders()
  const order = localOrders.find(o => o.id === orderId)
  const now = new Date().toISOString()

  if (!result) {
    const seq = String(Math.floor(10000000 + Math.random() * 89999999))
    const invoiceNo = `INV${seq}`
    const completedOrderId = crypto.randomUUID ? crypto.randomUUID() : `ord_${Date.now()}_${Math.random().toString(36).slice(2)}`
    result = { order_id: completedOrderId, invoice_no: invoiceNo, completed_at: now }
  }

  if (order) {
    const updatedOrder: AdvanceOrder = {
      ...order,
      status: 'completed',
      completed_at: result.completed_at,
      completed_order_id: result.order_id,
      invoice_number: result.invoice_no,
      final_payment_method: String(paymentMethod),
      remarks: remarks || order.remarks,
      updated_at: now,
    }
    saveLocalOrders(localOrders.map(o => o.id === orderId ? updatedOrder : o))

    const timeline = loadLocalTimeline()
    timeline.push(
      { id: Date.now(), advance_order_id: orderId, event_type: 'remaining_payment_received', label: 'Final Payment Received', remarks, created_at: now },
      { id: Date.now() + 1, advance_order_id: orderId, event_type: 'delivered', label: 'Delivered', remarks, created_at: now },
      { id: Date.now() + 2, advance_order_id: orderId, event_type: 'revenue_posted', label: `Revenue Posted (₹${order.total_amount})`, remarks, created_at: now },
      { id: Date.now() + 3, advance_order_id: orderId, event_type: 'invoice_generated', label: `Invoice Generated (${result.invoice_no})`, remarks, created_at: now }
    )
    saveLocalTimeline(timeline)

    const payments = loadLocalPayments()
    payments.push({
      id: orderId + '_rem',
      advance_order_id: orderId,
      payment_type: 'remaining',
      amount: order.remaining_balance,
      payment_method: String(paymentMethod),
      remarks,
      received_at: now,
    })
    saveLocalPayments(payments)
  }

  return result
}
