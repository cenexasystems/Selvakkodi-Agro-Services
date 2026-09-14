import React from 'react'
import { BRAND_ADDRESS, BRAND_EMAIL, BRAND_EN, BRAND_LOGO, BRAND_OWNER, BRAND_PHONE_DISPLAY } from '../lib/brand'
import { formatCurrency, formatQuantityDisplay, normalizeStructuredOrderItem, formatInvoiceNo } from '../lib/retail'

export interface InvoiceItem {
  id?: number | string
  product_id?: number | null
  name: string
  nameTa?: string | null
  tamil_name?: string | null
  qty: number
  quantity?: number
  unit?: string
  unit_type?: 'unit' | 'weight' | 'volume' | 'bundle'
  base_quantity?: number
  base_price?: number
  line_total?: number
  price: number
  offerPrice?: number | null
}

export interface InvoiceProps {
  invoiceNo: string
  date: string
  customerName: string
  phone: string
  address: string
  items: InvoiceItem[]
  subtotal: number
  shipping: number
  total: number
  status?: string
  userId?: string
  deliveryCharge?: number
  discountAmount?: number
  couponCode?: string | null
  manualDiscountAmount?: number
  gstAmount?: number
  paymentMode?: string
  onPrintReceipt?: () => void
}

export const Invoice: React.FC<InvoiceProps> = ({
  invoiceNo,
  date,
  customerName,
  phone,
  address,
  items,
  subtotal,
  shipping,
  total,
  status = 'Pending',
  userId,
  deliveryCharge = 0,
  discountAmount = 0,
  couponCode,
  manualDiscountAmount = 0,
  gstAmount = 0,
  paymentMode,
  onPrintReceipt,
}) => {
  const formattedInvoiceNo = formatInvoiceNo(invoiceNo)
  const dateStr = (() => {
    try { return new Date(date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) }
    catch { return new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) }
  })()

  const statusColor = status === 'completed' ? '#2E7D32' : status === 'cancelled' ? '#dc2626' : '#d97706'
  const effectiveDelivery = deliveryCharge || shipping

  return (
    <div
      id="invoice-print-root"
      className="w-full max-w-[680px] mx-auto bg-white text-[#1a1a2e] box-border flex flex-col p-3 sm:p-8 print:p-0 print:max-w-full overflow-hidden"
      style={{
        fontFamily: "'Inter', 'Segoe UI', sans-serif",
      }}
    >
      {/* ── HEADER ────────────────────────────────────────────────── */}
      <div style={{ textAlign: 'center', borderBottom: '1px solid #e5e7eb', paddingBottom: 12, marginBottom: 12 }}>
        <div style={{ width: 68, height: 68, margin: '0 auto 8px auto', background: '#ffffff', borderRadius: 14, border: '1px solid #A5D6A7', padding: 5, boxShadow: '0 4px 12px rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          <img src={BRAND_LOGO} alt={`${BRAND_EN} logo`} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
        </div>
        <div style={{ fontSize: 20, fontWeight: 900, color: '#2E7D32', letterSpacing: -0.5, textTransform: 'uppercase' }}>
          {BRAND_EN}
        </div>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#1B5E20', marginTop: 1 }}>
          {BRAND_OWNER}
        </div>
        <div style={{ fontSize: 10.5, color: '#4b5563', marginTop: 3, fontWeight: 500, paddingLeft: 8, paddingRight: 8 }}>
          {BRAND_ADDRESS}
        </div>
        <div style={{ fontSize: 10.5, color: '#4b5563', marginTop: 3, display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <span>📞 Phone: {BRAND_PHONE_DISPLAY}</span>
          <span>✉️ Email: {BRAND_EMAIL}</span>
        </div>
        <div style={{ fontSize: 11.5, fontWeight: 800, color: '#111111', marginTop: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          INVOICE: #{formattedInvoiceNo}
        </div>
        <div
          style={{
            display: 'inline-block', marginTop: 6, padding: '2px 10px', borderRadius: 99,
            background: statusColor + '18', color: statusColor,
            fontSize: 9.5, fontWeight: 800, letterSpacing: 0.8, textTransform: 'uppercase',
          }}
        >
          {status}
        </div>
      </div>

      {/* ── META ROW ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 mb-3 print:grid-cols-2">
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 9, fontWeight: 800, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 }}>Order Date</div>
          <div style={{ fontSize: 12.5, fontWeight: 700 }}>{dateStr}</div>
          {userId && (
            <>
              <div style={{ fontSize: 9, fontWeight: 800, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3, marginTop: 6 }}>User ID</div>
              <div style={{ fontSize: 10, fontWeight: 600, color: '#555', wordBreak: 'break-all', maxWidth: 200 }}>{userId}</div>
            </>
          )}
        </div>
        <div style={{ minWidth: 0, padding: '8px 12px', borderRadius: 10, background: '#E8F5E9', overflowWrap: 'anywhere' }}>
          <div style={{ fontSize: 8.5, fontWeight: 800, color: '#888', textTransform: 'uppercase', letterSpacing: 0.7 }}>Customer Name</div>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#1a1a2e', lineHeight: 1.3, wordBreak: 'break-word' }}>{customerName || 'Walk-in Customer'}</div>
          <div style={{ fontSize: 8.5, fontWeight: 800, color: '#888', textTransform: 'uppercase', letterSpacing: 0.7, marginTop: 4 }}>Mobile Number</div>
          <div style={{ fontSize: 11, color: '#555', lineHeight: 1.3, wordBreak: 'break-word' }}>{phone || '—'}</div>
          {address && <div style={{ fontSize: 10.5, color: '#777', marginTop: 3, lineHeight: 1.3, wordBreak: 'break-word' }}>{address}</div>}
          {paymentMode && <div style={{ fontSize: 9.5, color: '#777', marginTop: 3 }}>Payment: {paymentMode}</div>}
        </div>
      </div>

      {/* ── DIVIDER ──────────────────────────────────────────────── */}
      <div style={{ borderTop: '1px dashed #d0d0d0', marginBottom: 12 }} />

      {/* ── ITEMS TABLE ──────────────────────────────────────────── */}
      <div className="w-full overflow-x-auto">
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 320 }}>
          <thead>
            <tr style={{ background: '#f3f8f3', borderRadius: 8 }}>
              <th style={{ padding: '6px 8px', textAlign: 'left', fontSize: 9.5, fontWeight: 800, color: '#2E7D32', textTransform: 'uppercase', letterSpacing: 0.8, width: 28 }}>#</th>
              <th style={{ padding: '6px 8px', textAlign: 'left', fontSize: 9.5, fontWeight: 800, color: '#2E7D32', textTransform: 'uppercase', letterSpacing: 0.8 }}>Product</th>
              <th style={{ padding: '6px 8px', textAlign: 'center', fontSize: 9.5, fontWeight: 800, color: '#2E7D32', textTransform: 'uppercase', letterSpacing: 0.8, width: 45 }}>Qty</th>
              <th style={{ padding: '6px 8px', textAlign: 'right', fontSize: 9.5, fontWeight: 800, color: '#2E7D32', textTransform: 'uppercase', letterSpacing: 0.8, width: 75 }}>Rate</th>
              <th style={{ padding: '6px 8px', textAlign: 'right', fontSize: 9.5, fontWeight: 800, color: '#2E7D32', textTransform: 'uppercase', letterSpacing: 0.8, width: 85 }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => {
              const normalized = normalizeStructuredOrderItem(item as unknown as Record<string, unknown>)
              const displayName = normalized.tamil_name || item.nameTa || normalized.name
              return (
                <tr key={idx} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={{ padding: '7px 8px', fontSize: 11, color: '#999', verticalAlign: 'top' }}>{idx + 1}</td>
                  <td style={{ padding: '7px 8px', verticalAlign: 'top' }}>
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: '#1a1a2e' }}>{normalized.name}</div>
                    {displayName && displayName !== normalized.name && <div style={{ fontSize: 9.5, color: '#888', marginTop: 1 }}>{displayName}</div>}
                    {item.offerPrice && item.price !== item.offerPrice && (
                      <div style={{ fontSize: 9.5, color: '#aaa', textDecoration: 'line-through', marginTop: 1 }}>MRP ₹{item.price}</div>
                    )}
                    <div style={{ fontSize: 9.5, color: '#6b7280', marginTop: 1 }}>
                      {normalized.unit} · {formatCurrency(normalized.base_price)}
                    </div>
                  </td>
                  <td style={{ padding: '7px 8px', fontSize: 11.5, fontWeight: 600, textAlign: 'center', verticalAlign: 'top' }}>{formatQuantityDisplay(normalized.quantity, normalized.unit, normalized.unit_type)}</td>
                  <td style={{ padding: '7px 8px', fontSize: 11.5, fontWeight: 600, textAlign: 'right', verticalAlign: 'top', color: '#555' }}>{formatCurrency(normalized.base_price)}</td>
                  <td style={{ padding: '7px 8px', fontSize: 12, fontWeight: 800, textAlign: 'right', verticalAlign: 'top', color: '#1a1a2e' }}>{formatCurrency(normalized.line_total)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ── TOTALS ───────────────────────────────────────────────── */}
      <div style={{ marginTop: 14, borderTop: '2px solid #2E7D32', paddingTop: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{ minWidth: 220, width: '100%', maxWidth: 280 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 11.5, color: '#666' }}>Subtotal</span>
              <span style={{ fontSize: 11.5, fontWeight: 700 }}>{formatCurrency(subtotal)}</span>
            </div>
            {discountAmount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 11.5, color: '#2E7D32' }}>
                  Coupon{couponCode ? ` (${couponCode})` : ''}
                </span>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: '#2E7D32' }}>−{formatCurrency(discountAmount)}</span>
              </div>
            )}
            {manualDiscountAmount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 11.5, color: '#2E7D32' }}>Manual Discount</span>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: '#2E7D32' }}>−{formatCurrency(manualDiscountAmount)}</span>
              </div>
            )}
            {gstAmount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 11.5, color: '#666' }}>GST</span>
                <span style={{ fontSize: 11.5, fontWeight: 700 }}>+{formatCurrency(gstAmount)}</span>
              </div>
            )}
            {effectiveDelivery > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 11.5, color: '#666' }}>Delivery</span>
                <span style={{ fontSize: 11.5, fontWeight: 700 }}>{formatCurrency(effectiveDelivery)}</span>
              </div>
            )}
            {effectiveDelivery === 0 && discountAmount === 0 && manualDiscountAmount === 0 && gstAmount === 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 11.5, color: '#666' }}>Delivery</span>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: '#2E7D32' }}>FREE</span>
              </div>
            )}
            <div
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                borderTop: '2px solid #2E7D32', paddingTop: 6, marginTop: 4,
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 900, color: '#2E7D32', textTransform: 'uppercase', letterSpacing: 0.5 }}>Total</span>
              <span style={{ fontSize: 18, fontWeight: 900, color: '#2E7D32' }}>{formatCurrency(total)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── FOOTER ───────────────────────────────────────────────── */}
      <div
        style={{
          marginTop: 16, paddingTop: 10, borderTop: '1px dashed #d0d0d0',
          display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
          width: '100%', maxWidth: '100%', boxSizing: 'border-box', paddingLeft: 12, paddingRight: 12,
        }}
      >
        <div
          style={{
            fontSize: 11.5,
            fontWeight: 800,
            color: '#2E7D32',
            textAlign: 'center',
            maxWidth: '100%',
            overflowWrap: 'break-word',
            wordWrap: 'break-word',
            lineHeight: 1.35,
          }}
        >
          Thank you for choosing Selvakkodi Agro Service
        </div>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: '#2E7D32',
            marginTop: 4,
            textAlign: 'center',
            fontFamily: "'Noto Sans Tamil', 'Nirmala UI', 'Latha', 'Vijaya', 'Inter', sans-serif",
            lineHeight: 1.4,
            maxWidth: '100%',
            overflowWrap: 'break-word',
            wordWrap: 'break-word',
          }}
        >
          செல்வக்கொடி அக்ரோ சர்வீஸை தேர்ந்தெடுத்ததற்கு நன்றி!
        </div>
        {onPrintReceipt && (
          <button
            type="button"
            onClick={onPrintReceipt}
            className="print:hidden"
            style={{
              marginTop: 10, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              border: 0, borderRadius: 999, padding: '7px 16px',
              background: '#2E7D32', color: '#fff', fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
            }}
          >
            Print Receipt
          </button>
        )}
      </div>
    </div>
  )
}

