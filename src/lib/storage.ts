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

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = (err) => reject(err)
    reader.readAsDataURL(file)
  })
}

export const uploadProductImage = async (file: File): Promise<string> => {
  const base64Data = await fileToBase64(file)
  const res = await fetch('/api/upload', {
    method: 'POST',
    headers: getAuthHeaders(),
    credentials: 'include',
    body: JSON.stringify({
      filename: file.name,
      contentType: file.type || 'image/jpeg',
      data: base64Data,
      category: 'products',
    }),
  })

  const json = await res.json().catch(() => ({}))
  if (!res.ok || !json.success) {
    throw new Error(json.error || 'Failed to upload product image')
  }

  return json.data.url
}

export const uploadInvoicePdf = async (file: File, invoiceNo: string): Promise<string> => {
  const base64Data = await fileToBase64(file)
  const res = await fetch('/api/upload', {
    method: 'POST',
    headers: getAuthHeaders(),
    credentials: 'include',
    body: JSON.stringify({
      filename: `${invoiceNo}.pdf`,
      contentType: 'application/pdf',
      data: base64Data,
      category: 'invoices',
    }),
  })

  const json = await res.json().catch(() => ({}))
  if (!res.ok || !json.success) {
    throw new Error(json.error || 'Failed to upload invoice PDF')
  }

  return json.data.url
}

export const uploadAvatar = async (file: File): Promise<string> => {
  const base64Data = await fileToBase64(file)
  const res = await fetch('/api/upload', {
    method: 'POST',
    headers: getAuthHeaders(),
    credentials: 'include',
    body: JSON.stringify({
      filename: file.name,
      contentType: file.type || 'image/jpeg',
      data: base64Data,
      category: 'avatars',
    }),
  })

  const json = await res.json().catch(() => ({}))
  if (!res.ok || !json.success) {
    throw new Error(json.error || 'Failed to upload avatar')
  }

  return json.data.url
}
