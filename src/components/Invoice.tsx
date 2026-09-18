import React from 'react'
import { BRAND_ADDRESS, BRAND_EMAIL, BRAND_EN, BRAND_LOGO, BRAND_OWNER, BRAND_PHONE_DISPLAY } from '../lib/brand'
import { formatCurrency, formatQuantityDisplay, normalizeStructuredOrderItem, formatInvoiceNo, formatBillDateTime, formatGstLabel } from '../lib/retail'

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
  gst_percent?: number | null
  gstPercent?: number | null
  gst_rate?: number | null
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
  gstPercent?: number
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
  gstPercent,
  paymentMode,
  onPrintReceipt,
}) => {
  const formattedInvoiceNo = formatInvoiceNo(invoiceNo)
  const dateStr = formatBillDateTime(date)
  const gstLabel = formatGstLabel({
    gstPercent,
    gstAmount,
    subtotal,
    discountAmount,
    manualDiscountAmount,
    items,
  })

  const statusColor = status === 'completed' ? '#2E7D32' : status === 'cancelled' ? '#dc2626' : '#d97706'
  const effectiveDelivery = deliveryCharge || shipping

  return (
    <div
      id="invoice-print-root"
      className="w-full max-w-[680px] mx-auto bg-white text-[#1a1a2e] box-border flex flex-col p-3 sm:py-5 sm:px-7 print:p-0 print:max-w-full overflow-hidden"
      style={{
        fontFamily: "'Inter', 'Segoe UI', sans-serif",
      }}
    >
      {/* ── HEADER ────────────────────────────────────────────────── */}
      <div style={{ textAlign: 'center', borderBottom: '1px solid #e5e7eb', paddingBottom: 8, marginBottom: 8 }}>
        <div style={{ width: 56, height: 56, margin: '0 auto 6px auto', background: '#ffffff', borderRadius: 12, border: '1px solid #A5D6A7', padding: 4, boxShadow: '0 4px 12px rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          <img src={BRAND_LOGO} alt={`${BRAND_EN} logo`} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
        </div>
        <div style={{ fontSize: 18, fontWeight: 900, color: '#2E7D32', letterSpacing: -0.5, textTransform: 'uppercase' }}>
          {BRAND_EN}
        </div>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: '#1B5E20', marginTop: 1 }}>
          {BRAND_OWNER}
        </div>
        <div style={{ fontSize: 10, color: '#4b5563', marginTop: 2, fontWeight: 500, paddingLeft: 8, paddingRight: 8 }}>
          {BRAND_ADDRESS}
        </div>
        <div style={{ fontSize: 10, color: '#4b5563', marginTop: 2, display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <span>📞 Phone: {BRAND_PHONE_DISPLAY}</span>
          <span>✉️ Email: {BRAND_EMAIL}</span>
        </div>
        <div style={{ fontSize: 11, fontWeight: 800, color: '#111111', marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          INVOICE: #{formattedInvoiceNo}
        </div>
        <div
          style={{
            display: 'inline-block', marginTop: 4, padding: '2px 9px', borderRadius: 99,
            background: statusColor + '18', color: statusColor,
            fontSize: 9, fontWeight: 800, letterSpacing: 0.8, textTransform: 'uppercase',
          }}
        >
          {status}
        </div>
      </div>

      {/* ── META ROW ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 mb-2 text-[10.5px] leading-relaxed text-[#1a1a2e]">
        <div style={{ minWidth: 0 }}>
          <div>
            <span style={{ fontWeight: 700, color: '#555' }}>Customer name : </span>
            <span style={{ fontWeight: 800, color: '#111' }}>{customerName || 'Walk-in Customer'}</span>
          </div>
          <div>
            <span style={{ fontWeight: 700, color: '#555' }}>Mobile number : </span>
            <span style={{ fontWeight: 600 }}>{phone || '—'}</span>
          </div>
          <div>
            <span style={{ fontWeight: 700, color: '#555' }}>Payment : </span>
            <span style={{ fontWeight: 600 }}>{paymentMode || 'Cash'}</span>
          </div>
          {address && (
            <div>
              <span style={{ fontWeight: 700, color: '#555' }}>Address : </span>
              <span>{address}</span>
            </div>
          )}
          {userId && (
            <div>
              <span style={{ fontWeight: 700, color: '#555' }}>User ID : </span>
              <span style={{ wordBreak: 'break-all' }}>{userId}</span>
            </div>
          )}
        </div>
        <div style={{ textAlign: 'right', minWidth: 0 }}>
          <div>
            <span style={{ fontWeight: 700, color: '#555' }}>Date : </span>
            <span style={{ fontWeight: 800, color: '#111' }}>{dateStr}</span>
          </div>
        </div>
      </div>

      {/* ── DIVIDER ──────────────────────────────────────────────── */}
      <div style={{ borderTop: '1px dashed #d0d0d0', marginBottom: 8 }} />

      {/* ── ITEMS TABLE ──────────────────────────────────────────── */}
      <div className="w-full overflow-x-auto">
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 320 }}>
          <thead>
            <tr style={{ background: '#f3f8f3', borderRadius: 8 }}>
              <th style={{ padding: '5px 7px', textAlign: 'left', fontSize: 9.5, fontWeight: 800, color: '#2E7D32', textTransform: 'uppercase', letterSpacing: 0.8, width: 28 }}>#</th>
              <th style={{ padding: '5px 7px', textAlign: 'left', fontSize: 9.5, fontWeight: 800, color: '#2E7D32', textTransform: 'uppercase', letterSpacing: 0.8 }}>Product</th>
              <th style={{ padding: '5px 7px', textAlign: 'center', fontSize: 9.5, fontWeight: 800, color: '#2E7D32', textTransform: 'uppercase', letterSpacing: 0.8, width: 45 }}>Qty</th>
              <th style={{ padding: '5px 7px', textAlign: 'right', fontSize: 9.5, fontWeight: 800, color: '#2E7D32', textTransform: 'uppercase', letterSpacing: 0.8, width: 75 }}>Rate</th>
              <th style={{ padding: '5px 7px', textAlign: 'right', fontSize: 9.5, fontWeight: 800, color: '#2E7D32', textTransform: 'uppercase', letterSpacing: 0.8, width: 85 }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => {
              const normalized = normalizeStructuredOrderItem(item as unknown as Record<string, unknown>)
              const displayName = normalized.tamil_name || item.nameTa || normalized.name
              return (
                <tr key={idx} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={{ padding: '5px 7px', fontSize: 10.5, color: '#999', verticalAlign: 'top' }}>{idx + 1}</td>
                  <td style={{ padding: '5px 7px', verticalAlign: 'top' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#1a1a2e' }}>{normalized.name}</div>
                    {displayName && displayName !== normalized.name && <div style={{ fontSize: 9, color: '#888', marginTop: 1 }}>{displayName}</div>}
                    {item.offerPrice && item.price !== item.offerPrice && (
                      <div style={{ fontSize: 9, color: '#aaa', textDecoration: 'line-through', marginTop: 1 }}>MRP ₹{item.price}</div>
                    )}
                    <div style={{ fontSize: 9, color: '#6b7280', marginTop: 1 }}>
                      {normalized.unit} · {formatCurrency(normalized.base_price)}
                    </div>
                  </td>
                  <td style={{ padding: '5px 7px', fontSize: 11, fontWeight: 600, textAlign: 'center', verticalAlign: 'top' }}>{formatQuantityDisplay(normalized.quantity, normalized.unit, normalized.unit_type)}</td>
                  <td style={{ padding: '5px 7px', fontSize: 11, fontWeight: 600, textAlign: 'right', verticalAlign: 'top', color: '#555' }}>{formatCurrency(normalized.base_price)}</td>
                  <td style={{ padding: '5px 7px', fontSize: 11.5, fontWeight: 800, textAlign: 'right', verticalAlign: 'top', color: '#1a1a2e' }}>{formatCurrency(normalized.line_total)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ── TOTALS ───────────────────────────────────────────────── */}
      <div style={{ marginTop: 8, borderTop: '2px solid #2E7D32', paddingTop: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{ minWidth: 220, width: '100%', maxWidth: 280 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
              <span style={{ fontSize: 11, color: '#666' }}>Subtotal</span>
              <span style={{ fontSize: 11, fontWeight: 700 }}>{formatCurrency(subtotal)}</span>
            </div>
            {discountAmount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: 11, color: '#2E7D32' }}>
                  Coupon{couponCode ? ` (${couponCode})` : ''}
                </span>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#2E7D32' }}>−{formatCurrency(discountAmount)}</span>
              </div>
            )}
            {manualDiscountAmount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: 11, color: '#2E7D32' }}>Manual Discount</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#2E7D32' }}>−{formatCurrency(manualDiscountAmount)}</span>
              </div>
            )}
            {gstAmount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: 11, color: '#666' }}>{gstLabel}</span>
                <span style={{ fontSize: 11, fontWeight: 700 }}>+{formatCurrency(gstAmount)}</span>
              </div>
            )}
            {effectiveDelivery > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: 11, color: '#666' }}>Delivery</span>
                <span style={{ fontSize: 11, fontWeight: 700 }}>{formatCurrency(effectiveDelivery)}</span>
              </div>
            )}
            {effectiveDelivery === 0 && discountAmount === 0 && manualDiscountAmount === 0 && gstAmount === 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: 11, color: '#666' }}>Delivery</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#2E7D32' }}>FREE</span>
              </div>
            )}
            <div
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                borderTop: '2px solid #2E7D32', paddingTop: 5, marginTop: 3,
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 900, color: '#2E7D32', textTransform: 'uppercase', letterSpacing: 0.5 }}>Total</span>
              <span style={{ fontSize: 17, fontWeight: 900, color: '#2E7D32' }}>{formatCurrency(total)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── FOOTER ───────────────────────────────────────────────── */}
      <div
        style={{
          marginTop: 6, paddingTop: 8, borderTop: '1px dashed #d0d0d0',
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
            lineHeight: 1.5,
          }}
        >
          Thank you for choosing Selvakkodi Agro Service
        </div>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: '#2E7D32',
            marginTop: 8,
            textAlign: 'center',
            fontFamily: "'Noto Sans Tamil', 'Nirmala UI', 'Latha', 'Vijaya', 'Inter', sans-serif",
            lineHeight: 1.65,
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
              marginTop: 14, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              border: 0, borderRadius: 999, padding: '8px 22px', minHeight: 38,
              background: '#2E7D32', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(46, 125, 50, 0.25)',
            }}
          >
            Print Receipt
          </button>
        )}
      </div>
    </div>
  )
}

