// Phone number validation and normalization (+91 India format with international compatibility)
export function normalizePhone(input: string): string | null {
  if (!input) return null

  // Strip everything except digits
  const raw = input.replace(/\D/g, '')
  if (!raw) return null

  // 10-digit Indian mobile (starts with 6-9)
  if (/^[6-9]\d{9}$/.test(raw)) {
    return '91' + raw
  }

  // 12-digit Indian mobile with 91 prefix (91XXXXXXXXXX)
  if (/^91[6-9]\d{9}$/.test(raw)) {
    return raw
  }

  // 11-digit starting with 0 (0XXXXXXXXXX)
  if (/^0[6-9]\d{9}$/.test(raw)) {
    return '91' + raw.slice(1)
  }

  // Legacy +60 Malaysian compatibility
  if (/^60\d{8,10}$/.test(raw)) {
    return raw
  }

  // Any standard 10-15 digit phone
  if (/^\d{10,15}$/.test(raw)) {
    return raw
  }

  return null
}

export function isValidPhone(input: string): boolean {
  return normalizePhone(input) !== null
}

export function getSubscriberDigits(input: string): string | null {
  const normalized = normalizePhone(input)
  if (!normalized) return null
  if (normalized.startsWith('91') && normalized.length === 12) {
    return normalized.slice(2)
  }
  if (normalized.startsWith('60')) {
    return normalized.slice(2)
  }
  return normalized
}

export function normalizePhoneForWhatsApp(input: string): string {
  return normalizePhone(input) || input.replace(/\D/g, '')
}

export function toWhatsAppUrl(phone: string, text?: string): string {
  const normalized = normalizePhoneForWhatsApp(phone) || normalizePhone(phone)
  const queryParams: string[] = []

  if (normalized) {
    queryParams.push(`phone=${normalized}`)
  }
  if (text) {
    queryParams.push(`text=${encodeURIComponent(text)}`)
  }

  return `https://api.whatsapp.com/send${queryParams.length > 0 ? `?${queryParams.join('&')}` : ''}`
}
