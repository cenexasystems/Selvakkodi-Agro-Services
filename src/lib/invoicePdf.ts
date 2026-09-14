import { jsPDF } from 'jspdf'
import html2canvas from 'html2canvas'
import { BRAND_ADDRESS, BRAND_EMAIL, BRAND_EN, BRAND_OWNER, BRAND_PHONE_DISPLAY } from './brand'
import { formatCurrency, formatQuantityDisplay, normalizeStructuredOrderItem, formatInvoiceNo } from './retail'
import { LOGO_BASE64 } from './logoBase64'

export type InvoicePdfData = {
  invoiceNo: string
  date: string
  customerName: string
  phone: string
  address: string
  items: Array<Record<string, unknown>>
  subtotal: number
  shipping: number
  total: number
  discountAmount?: number
  manualDiscountAmount?: number
  gstAmount?: number
  couponCode?: string | null
  paymentMode?: string
}

const money = (value: number) => {
  const formatted = formatCurrency(Number(value || 0)).replace(/\s+/g, ' ')
  return formatted.replace(/^INR\s*/, 'Rs. ').replace(/^₹\s*/, 'Rs. ')
}

/** Creates a compact A4 invoice that can be attached as a file to WhatsApp. */
export function createInvoicePdf(data: InvoicePdfData): Blob {
  const formattedNo = formatInvoiceNo(data.invoiceNo)
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageWidth = 210
  const left = 16
  const right = 194
  const primaryColor = '#2E7D32' // Selvakkodi Green
  const ink = '#18202a'
  const muted = '#68717c'
  let y = 16

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(muted)
  doc.text('TAX INVOICE', left, y)
  doc.text(`Invoice: #${formattedNo}`, right, y, { align: 'right' })
  y += 7
  doc.setDrawColor('#d8dce0')
  doc.line(left, y, right, y)
  y += 10

  try {
    doc.addImage(LOGO_BASE64, 'JPEG', left, y, 22, 22)
  } catch {
    doc.setTextColor(primaryColor)
    doc.setFontSize(16)
    doc.text(BRAND_EN, left, y + 10)
  }
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(primaryColor)
  doc.text(BRAND_EN, left + 26, y + 4)
  doc.setFontSize(9)
  doc.setTextColor('#1B5E20')
  doc.text(BRAND_OWNER, left + 26, y + 9)
  doc.setFontSize(7.5)
  doc.setTextColor(muted)
  doc.setFont('helvetica', 'normal')
  doc.text(BRAND_ADDRESS, left + 26, y + 14, { maxWidth: 95 })
  doc.text(`Phone: ${BRAND_PHONE_DISPLAY}  |  Email: ${BRAND_EMAIL}`, left + 26, y + 23)
  doc.text(`Date: ${new Date(data.date).toLocaleDateString('en-IN')}`, right, y + 2, { align: 'right' })
  doc.text(`Payment: ${data.paymentMode || 'POS'}`, right, y + 7, { align: 'right' })
  y += 30

  const customerName = String(data.customerName || 'Walk-in Customer').trim()
  const formatPhoneDisplay = (ph: string) => {
    const d = ph.replace(/\D/g, '')
    return d.length === 12 && d.startsWith('91') ? `${d.slice(0, 2)} ${d.slice(2)}` : ph
  }
  const customerPhone = formatPhoneDisplay(String(data.phone || '—').trim())
  const customerAddress = String(data.address || '').trim()
  const customerNameLines = doc.splitTextToSize(customerName, 165) as string[]
  const customerAddressLines = customerAddress
    ? doc.splitTextToSize(`Address: ${customerAddress}`, 165) as string[]
    : []
  const customerBoxHeight = 19 + customerNameLines.length * 4 + customerAddressLines.length * 4

  doc.setFillColor('#E8F5E9')
  doc.roundedRect(left, y, right - left, customerBoxHeight, 2, 2, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(muted)
  doc.text('BILL TO', left + 5, y + 7)
  doc.setFontSize(10)
  doc.setTextColor(ink)
  doc.text(customerNameLines, left + 5, y + 13)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(muted)
  const phoneY = y + 13 + customerNameLines.length * 4 + 2
  doc.text(`Mobile Number: ${customerPhone}`, left + 5, phoneY)
  if (customerAddressLines.length > 0) {
    doc.text(customerAddressLines, left + 5, phoneY + 5)
  }
  y += customerBoxHeight + 9

  doc.setFillColor(primaryColor)
  doc.rect(left, y, right - left, 9, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor('#ffffff')
  doc.text('#', left + 4, y + 6)
  doc.text('ITEM DESCRIPTION', left + 14, y + 6)
  doc.text('QTY', 140, y + 6, { align: 'right' })
  doc.text('RATE', 166, y + 6, { align: 'right' })
  doc.text('AMOUNT', right - 4, y + 6, { align: 'right' })
  y += 14

  data.items.forEach((raw, index) => {
    const item = normalizeStructuredOrderItem(raw)
    if (y > 260) { doc.addPage(); y = 20 }
    const name = item.name || 'Item'
    const nameLines = doc.splitTextToSize(name, 105) as string[]
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(ink)
    doc.text(String(index + 1), left + 4, y)
    doc.text(nameLines, left + 14, y)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(muted)
    doc.text(`${formatQuantityDisplay(item.quantity, item.unit, item.unit_type)}`, 140, y, { align: 'right' })
    doc.text(money(item.base_price), 166, y, { align: 'right' })
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(ink)
    doc.text(money(item.line_total), right - 4, y, { align: 'right' })
    y += Math.max(10, nameLines.length * 4 + 4)
    doc.setDrawColor('#e8eaed')
    doc.line(left, y - 3, right, y - 3)
  })

  y = Math.max(y + 6, 150)
  const rows: Array<[string, string, string]> = [['Subtotal', money(data.subtotal), ink]]
  if ((data.discountAmount || 0) > 0) rows.push([`Coupon${data.couponCode ? ` (${data.couponCode})` : ''}`, `-${money(data.discountAmount || 0)}`, '#2E7D32'])
  if ((data.manualDiscountAmount || 0) > 0) rows.push(['Discount', `-${money(data.manualDiscountAmount || 0)}`, '#2E7D32'])
  if ((data.gstAmount || 0) > 0) rows.push(['GST', money(data.gstAmount || 0), ink])
  rows.push(['Delivery', (data.shipping || 0) > 0 ? money(data.shipping) : 'FREE', ink])
  doc.setFontSize(9)
  rows.forEach(([label, value, color]) => { doc.setFont('helvetica', 'normal'); doc.setTextColor(color); doc.text(label, 143, y, { align: 'right' }); doc.text(value, right - 4, y, { align: 'right' }); y += 7 })
  doc.setDrawColor(primaryColor)
  doc.setLineWidth(0.7)
  doc.line(118, y - 3, right, y - 3)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(primaryColor)
  doc.text('TOTAL', 143, y + 6, { align: 'right' })
  doc.text(money(data.total), right - 4, y + 6, { align: 'right' })

  y = 271
  doc.setDrawColor('#d8dce0')
  doc.setLineWidth(0.2)
  doc.line(left, y, right, y)

  if (typeof document !== 'undefined') {
    try {
      const footerCanvas = document.createElement('canvas')
      const scale = 3
      const footerWidthMm = right - left
      const footerHeightMm = 21
      const canvasW = Math.round(footerWidthMm * 3.78 * scale)
      const canvasH = Math.round(footerHeightMm * 3.78 * scale)
      footerCanvas.width = canvasW
      footerCanvas.height = canvasH
      const ctx = footerCanvas.getContext('2d')
      if (ctx) {
        ctx.fillStyle = primaryColor
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'

        const maxTextWidth = canvasW - Math.round(12 * 3.78 * scale) // 6mm safe padding each side
        const enFontSize = Math.round(9.5 * 1.333 * scale)
        const taFontSize = Math.round(9 * 1.333 * scale)

        const wrap = (text: string, font: string): string[] => {
          ctx.font = font
          if (ctx.measureText(text).width <= maxTextWidth) {
            return [text]
          }
          const words = text.split(' ')
          const lines: string[] = []
          let cur = ''
          for (const w of words) {
            const candidate = cur ? `${cur} ${w}` : w
            if (ctx.measureText(candidate).width <= maxTextWidth || !cur) {
              cur = candidate
            } else {
              lines.push(cur)
              cur = w
            }
          }
          if (cur) lines.push(cur)
          return lines
        }

        const enFont = `bold ${enFontSize}px Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`
        const taFont = `bold ${taFontSize}px "Noto Sans Tamil", "Nirmala UI", "Latha", "Vijaya", "Tamil Sangam MN", sans-serif`

        const enLines = wrap('Thank you for choosing Selvakkodi Agro Service', enFont)
        const taLines = wrap('செல்வக்கொடி அக்ரோ சர்வீஸை தேர்ந்தெடுத்ததற்கு நன்றி!', taFont)

        const enLineHeight = Math.round(enFontSize * 1.3)
        const taLineHeight = Math.round(taFontSize * 1.35)
        const blockGap = Math.round(3.5 * 3.78 * scale)

        const totalH = (enLines.length * enLineHeight) + blockGap + (taLines.length * taLineHeight)
        let curY = Math.max(enLineHeight / 2, (canvasH - totalH) / 2 + (enLineHeight / 2))
        const centerX = canvasW / 2

        ctx.font = enFont
        for (const line of enLines) {
          ctx.fillText(line, centerX, curY)
          curY += enLineHeight
        }

        curY += blockGap - (enLineHeight / 2) + (taLineHeight / 2)
        ctx.font = taFont
        for (const line of taLines) {
          ctx.fillText(line, centerX, curY)
          curY += taLineHeight
        }

        const footerImg = footerCanvas.toDataURL('image/png')
        doc.addImage(footerImg, 'PNG', left, y + 2, footerWidthMm, footerHeightMm, undefined, 'FAST')
      }
    } catch {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8.5)
      doc.setTextColor(primaryColor)
      doc.text('Thank you for choosing Selvakkodi Agro Service', pageWidth / 2, y + 6, { align: 'center' })
    }
  } else {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.setTextColor(primaryColor)
    doc.text('Thank you for choosing Selvakkodi Agro Service', pageWidth / 2, y + 6, { align: 'center' })
  }
  return doc.output('blob')
}

export function invoicePdfFile(data: InvoicePdfData): File {
  return new File([createInvoicePdf(data)], `Invoice-${formatInvoiceNo(data.invoiceNo)}.pdf`, { type: 'application/pdf' })
}

/** Captures the rendered invoice so the downloaded PDF matches the visible view. */
export async function invoicePdfFileFromElement(
  element: HTMLElement,
  invoiceNo: string,
): Promise<File> {
  const formattedNo = formatInvoiceNo(invoiceNo)
  await document.fonts?.ready
  const canvas = await html2canvas(element, {
    backgroundColor: '#ffffff',
    scale: 2,
    useCORS: true,
    logging: false,
    windowWidth: Math.max(element.scrollWidth, 680),
    onclone: (clonedDoc) => {
      const el = clonedDoc.getElementById('invoice-print-root')
      if (el) {
        el.style.width = '680px'
        el.style.maxWidth = '680px'
      }
    },
  })

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  const pageWidth = 210
  const pageHeight = 297
  const imageHeight = (canvas.height * pageWidth) / canvas.width
  const image = canvas.toDataURL('image/png')

  if (imageHeight <= pageHeight + 5) {
    doc.addImage(image, 'PNG', 0, 0, pageWidth, Math.min(pageHeight, imageHeight), undefined, 'FAST')
  } else if (imageHeight <= pageHeight * 1.35) {
    const scale = pageHeight / imageHeight
    const fittedWidth = pageWidth * scale
    const xOffset = (pageWidth - fittedWidth) / 2
    doc.addImage(image, 'PNG', xOffset, 0, fittedWidth, pageHeight, undefined, 'FAST')
  } else {
    let offset = 0
    let page = 0
    while (offset < imageHeight) {
      if (page > 0) doc.addPage()
      doc.addImage(image, 'PNG', 0, -offset, pageWidth, imageHeight, undefined, 'FAST')
      offset += pageHeight
      page += 1
    }
  }

  return new File([doc.output('blob')], `Invoice-${formattedNo}.pdf`, { type: 'application/pdf' })
}
