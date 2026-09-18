'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Invoice } from '../components/Invoice'
import { Printer, ArrowLeft, MessageCircle } from 'lucide-react'
import { printThermalReceipt } from '../lib/thermalPrint'
import { invoicePdfFileFromElement } from '../lib/invoicePdf'
import { normalizeStructuredOrderItem } from '../lib/retail'
import { buildProfessionalWhatsAppMessage } from '../lib/whatsappMessage'
import { orderService } from '../services/orderService'

export default function DigitalInvoice() {
  const { id } = useParams()
  const navigate = useNavigate()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [invoice, setInvoice] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const invoiceElementRef = useRef<HTMLDivElement>(null)

  const handleBack = () => {
    if (window.history.state && typeof window.history.state.idx === 'number' && window.history.state.idx > 0) {
      navigate(-1)
      return
    }
    if (window.opener && !window.opener.closed) {
      window.close()
    }
    navigate('/dashboard')
  }

  useEffect(() => {
    const loadInvoice = async () => {
      try {
        const identifier = decodeURIComponent(id || '').trim()
        let invoiceData: any = null
        try {
          invoiceData = await orderService.getOrderById(identifier, true)
        } catch (firstErr) {
          // Fallback: If formatted with INV (e.g. INV10000066), try stripped numeric/clean ID
          const clean = identifier.replace(/^[#\s]*inv[-_\s]*/i, '').trim()
          if (clean && clean !== identifier) {
            invoiceData = await orderService.getOrderById(clean, true)
          } else {
            throw firstErr
          }
        }
        if (!invoiceData) {
          throw new Error('Invoice not found')
        }
        setInvoice(invoiceData)
      } catch (err: unknown) {
        if (err instanceof Error) {
          setError(err.message)
        } else {
          setError('Invoice not found')
        }
      } finally {
        setLoading(false)
      }
    }
    if (id) loadInvoice()
  }, [id])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f9faf6] flex items-center justify-center">
        <span className="w-8 h-8 border-4 border-sand border-t-sageDark rounded-full animate-spin" />
      </div>
    )
  }

  if (error || !invoice) {
    return (
      <div className="min-h-screen bg-[#f9faf6] flex flex-col items-center justify-center text-center p-6">
        <h1 className="text-2xl font-bold text-sageDark mb-2">Invoice Not Found</h1>
        <p className="text-gray-500 mb-6">The requested invoice could not be found.</p>
        <button
          onClick={handleBack}
          className="inline-flex items-center gap-2 px-6 py-2 bg-sage text-white rounded-full font-bold hover:bg-sageDark transition cursor-pointer"
        >
          <ArrowLeft size={16} /> Back
        </button>
      </div>
    )
  }

  const invoiceItems = (Array.isArray(invoice.items) ? invoice.items : [])
    .map((item: Record<string, unknown>) => normalizeStructuredOrderItem(item))
  const subtotal = invoiceItems.reduce((sum: number, item: ReturnType<typeof normalizeStructuredOrderItem>) => sum + item.line_total, 0)

  const downloadPdf = async () => {
    if (!invoiceElementRef.current) return
    const file = await invoicePdfFileFromElement(invoiceElementRef.current, invoice.invoice_no)
    const url = URL.createObjectURL(file)
    const link = document.createElement('a')
    link.href = url
    link.download = file.name
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const gstPercent = invoice.gst_percent ?? invoice.gstPercent ?? invoice.gst_rate

  const whatsappUrl = (() => {
    if (!invoice) return ''

    // 1. Format phone number in international format for wa.me
    const rawPhone = String(invoice.phone || invoice.customer_phone || '').trim()
    const cleanDigits = rawPhone.replace(/\D/g, '')
    let phoneNumber = ''
    if (cleanDigits.length === 10 && /^[6-9]/.test(cleanDigits)) {
      phoneNumber = `91${cleanDigits}`
    } else if (cleanDigits.length === 11 && cleanDigits.startsWith('0')) {
      phoneNumber = `91${cleanDigits.slice(1)}`
    } else if (cleanDigits.length >= 10) {
      phoneNumber = cleanDigits
    }

    // 2. Build items list and message synchronously from actual invoice data
    const items = invoiceItems.map((item: ReturnType<typeof normalizeStructuredOrderItem>) => ({
      name: item.name || 'Item',
      qty: item.quantity || 1,
      unit: item.unit || 'piece',
      unitType: item.unit_type,
      rate: item.base_price || 0,
      lineTotal: item.line_total || 0,
    }))

    const message = buildProfessionalWhatsAppMessage({
      customerName: invoice.customer_name || 'Valued Customer',
      phone: invoice.phone || '',
      invoiceNumber: invoice.invoice_no || String(id || ''),
      invoiceId: invoice.id,
      orderId: invoice.id,
      invoiceDate: invoice.billing_date || invoice.created_at || new Date().toISOString(),
      items,
      subtotal,
      couponDiscount: invoice.discount_amount,
      manualDiscountAmount: invoice.manual_discount_amount,
      shipping: invoice.delivery_charge,
      gstAmount: invoice.total_gst || invoice.gst_amount || 0,
      gstPercent,
      total: invoice.total,
      paymentMode: invoice.payment_mode || invoice.payment_method,
      invoiceUrl: typeof window !== 'undefined' ? window.location.href : '',
    })

    // 3. Build valid wa.me link: https://wa.me/<phone_number>?text=<encoded_message>
    return phoneNumber
      ? `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`
      : `https://wa.me/?text=${encodeURIComponent(message)}`
  })()

  const printReceipt = () => {
    const subtotal = invoice.total - (invoice.delivery_charge || 0) + (invoice.discount_amount || 0)
    printThermalReceipt({
      invoiceNo: invoice.invoice_no,
      date: invoice.billing_date || invoice.created_at,
      customerName: invoice.customer_name,
      phone: invoice.phone,
      items: (invoice.items || []).map((item: Record<string, unknown>) => ({
        name: item.name || item.product_name,
        qty: item.qty || item.quantity,
        unit: item.unit,
        price: item.price || item.base_price || 0,
        line_total: item.line_total
      })),
      subtotal,
      shipping: invoice.delivery_charge || 0,
      couponDiscount: invoice.discount_amount || 0,
      totalGst: invoice.total_gst || invoice.gst_amount || 0,
      gstPercent,
      total: invoice.total > 0 ? invoice.total : (subtotal + (invoice.delivery_charge || 0) + (invoice.total_gst || invoice.gst_amount || 0) - (invoice.discount_amount || 0) - (invoice.manual_discount_amount || 0))
    })
  }

  return (
    <div className="h-full overflow-y-auto bg-[#f9faf6] font-sans pb-12 print:bg-white print:pb-0">
      {/* Top action bar */}
      <div className="bg-[#f9faf6] p-3 sm:p-4 sticky top-0 z-50 print:hidden flex items-center justify-between max-w-4xl mx-auto gap-2">
        <button onClick={handleBack} className="flex items-center gap-1.5 sm:gap-2 text-sageDark hover:text-[#2d5a27] font-semibold text-xs sm:text-sm transition-colors bg-white border border-sand/40 px-3 sm:px-4 py-2 rounded-full shadow-sm cursor-pointer shrink-0">
          <ArrowLeft size={15} /> Back
        </button>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            onClick={downloadPdf}
            className="flex items-center gap-1.5 sm:gap-2 bg-[#2E7D32] text-white px-3.5 sm:px-5 py-2 rounded-full font-bold text-xs sm:text-sm shadow-md hover:bg-[#1B5E20] transition-colors shrink-0"
          >
            <Printer size={15} /> PDF
          </button>
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 sm:gap-2 bg-[#25D366] text-white px-3.5 sm:px-5 py-2 rounded-full font-bold text-xs sm:text-sm shadow-md hover:bg-[#1EBE5D] transition-colors shrink-0 no-underline cursor-pointer"
          >
            <MessageCircle size={15} /> WhatsApp
          </a>
        </div>
      </div>

      <div className="max-w-3xl mx-auto mt-4 print:mt-0 px-2 sm:px-0">
        <div ref={invoiceElementRef} className="bg-white shadow-xl rounded-2xl overflow-hidden print:shadow-none print:rounded-none border border-sand/20 print:border-none">
          <Invoice
            invoiceNo={invoice.invoice_no}
            date={invoice.billing_date || invoice.created_at}
            customerName={invoice.customer_name}
            phone={invoice.phone}
            address={invoice.address}
            items={invoice.items || []}
            subtotal={subtotal}
            shipping={invoice.delivery_charge || 0}
            discountAmount={invoice.discount_amount || 0}
            manualDiscountAmount={invoice.manual_discount_amount || 0}
            gstAmount={invoice.total_gst || invoice.gst_amount || 0}
            gstPercent={gstPercent}
            couponCode={invoice.coupon_code}
            total={invoice.total > 0 ? invoice.total : (subtotal + (invoice.delivery_charge || 0) + (invoice.total_gst || invoice.gst_amount || 0) - (invoice.discount_amount || 0) - (invoice.manual_discount_amount || 0))}
            status={invoice.status}
            paymentMode={invoice.payment_mode || invoice.payment_method}
            onPrintReceipt={printReceipt}
          />
        </div>
      </div>
    </div>
  )
}
