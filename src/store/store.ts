import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { fetchAllCategories, fetchAllProducts } from '../services/productService'
import { fetchAllVariants, type ProductVariant } from '../services/variantService'
import { settingsService } from '../services/settingsService'
import { BRAND_ADDRESS, BRAND_EMAIL, BRAND_EN, BRAND_INSTAGRAM, BRAND_OWNER, BRAND_PHONE_DISPLAY } from '../lib/brand'
import {
  calculateLineTotal,
  normalizeSelectedQuantity,
  normalizeUnitType,
  toNumber,
  type QuantityOption,
  type UnitType,
} from '../lib/retail'

export type { ProductVariant }

/** Shared state for authentication, products, billing, and settings. */

// --- Types ---
export interface Product {
  id: string | number // Support both legacy numeric IDs and new UUIDs
  name: string
  nameTa?: string
  tamilName?: string
  category: string
  categoryId?: number | string | null
  remedy: string[]
  price: number
  offerPrice?: number | null
  unitType: UnitType
  unitLabel: string
  baseQuantity: number
  stockQuantity: number
  stockUnit: string
  allowDecimalQuantity: boolean
  predefinedOptions: QuantityOption[]
  isActive: boolean
  sortOrder: number
  unit: string
  rating: number
  stock: number
  description: string
  descriptionTa?: string
  benefits: string
  benefitsTa?: string
  image: string
  imageUrl?: string
  source?: 'catalogue' | 'manual'
  itemType?: 'product' | 'service'
  note?: string | null
  hasVariants?: boolean

  // POS inventory fields
  sku?: string
  barcode?: string
  brand?: string
  purchasePrice?: number
  mrp?: number
  gstPercent?: number
  openingStock?: number
  lowStockAlert?: number
  supplier?: string
  size?: string
  color?: string
}

export interface CartItem extends Product {
  qty: number
  selectedUnit: string
  basePrice: number
  lineTotal: number
  variantId?: string      // UUID of the selected variant row
  variantName?: string    // display name e.g. "Cycle Brand"
  parentProductId?: string // original products.id when item was created from a variant

  // POS billing fields
  cartItemId: string
  discountType: 'amount' | 'percent'
  discountValue: number
  gstRate: number
  gstAmount: number
}

interface AuthUser {
  id: string
  name: string
  email: string
  mobile?: string
  role: 'admin' | 'customer'
  avatarUrl?: string
}

interface AuthState {
  user: AuthUser | null
  loading: boolean
  isAuthenticated: () => boolean
  isAdmin: () => boolean
  setAuth: (user: AuthUser | null) => void
  logout: () => Promise<void>
  initialize: () => Promise<void>
}

interface ProductState {
  products: Product[]
  loading: boolean
  error: string | null
  lastFetch: number
  fetchProducts: (force?: boolean) => Promise<void>
}

interface CartState {
  items: CartItem[]
  addItem: (product: Product, quantity: number, unit: string, variantId?: string, variantName?: string, parentProductId?: string) => void
  removeItem: (productId: string | number) => void
  updateQuantity: (productId: string | number, quantity: number) => void
  clearCart: () => void
  totalItems: () => number
  cartSubtotal: () => number
  // Backward-compatible aliases used by existing UI
  add: (product: Product) => void
  remove: (productId: string | number) => void
  updateQty: (productId: string | number, quantity: number) => void
  clear: () => void
  count: () => number
  total: () => number
}

interface FavState {
  items: Product[]
  toggle: (product: Product) => void
  isFav: (productId: string | number) => boolean
  clear: () => void
}

interface ProductModalState {
  product: Product | null
  open: boolean
  openProduct: (product: Product) => void
  closeProduct: () => void
}

export interface StoreSettings {
  name: string
  ownerName: string
  phone: string
  email?: string
  address: string
  gstEnabled: boolean
  lowStockLimit: number
  instagram?: string
}

interface SettingsState {
  settings: StoreSettings | null
  loading: boolean
  fetchSettings: () => Promise<void>
}

interface VariantStoreState {
  variantsMap: Record<string, ProductVariant[]>
  fetched: boolean
  fetchVariants: () => Promise<void>
  refetchVariants: () => Promise<void>
  getVariants: (productId: string) => ProductVariant[]
  getDefaultVariant: (productId: string) => ProductVariant | null
  hasVariants: (productId: string | number) => boolean
}

interface VariantModalState {
  product: Product | null
  open: boolean
  openVariantModal: (product: Product) => void
  closeVariantModal: () => void
}

type SessionFallback = {
  id?: string
  email?: string | null
  phone?: string | null
  user_metadata?: {
    name?: string
    mobile?: string
  }
}

const asRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value === 'object' && value !== null) {
    return value as Record<string, unknown>
  }
  return {}
}

const readString = (value: unknown, fallback = '') => (typeof value === 'string' ? value : fallback)

const LEGACY_CATEGORY_NAMES = new Set<string>()

const toAuthUser = (profile: unknown, fallback?: SessionFallback): AuthUser => {
  const profileRow = asRecord(profile)
  const fallbackMeta = asRecord(fallback?.user_metadata)
  const email = String(profileRow.email || fallback?.email || '')
  const isAdmin = profileRow.role === 'admin'

  return {
    id: String(profileRow.id || fallback?.id || ''),
    name: String(profileRow.name || fallbackMeta.name || fallback?.email || 'Customer'),
    email,
    mobile: String(profileRow.mobile || fallbackMeta.mobile || fallback?.phone || ''),
    role: isAdmin ? 'admin' : 'customer',
    avatarUrl: readString(profileRow.avatar_url) || undefined,
  }
}

const mapDbProduct = (input: unknown, categoriesById: Record<string, string> = {}): Product => {
  const p = asRecord(input)
  const categoryId = typeof p.category_id === 'string' || typeof p.category_id === 'number' ? p.category_id : null
  const image = readString(p.image_url) || readString(p.image) || '/product-placeholder.svg'
  const remedy = Array.isArray(p.remedy)
    ? p.remedy.filter((entry): entry is string => typeof entry === 'string')
    : []

  return {
    id: String(p.id || ''),
    name: readString(p.name, 'Product'),
    nameTa: readString(p.name_ta) || readString(p.tamil_name),
    tamilName: readString(p.tamil_name) || readString(p.name_ta),
    category: categoriesById[String(categoryId)] || (() => {
      const legacyCategory = readString(p.category).trim()
      return LEGACY_CATEGORY_NAMES.has(legacyCategory.toLowerCase()) ? '' : legacyCategory
    })(),
    categoryId,
    remedy,
    price: toNumber(p.price, 0),
    offerPrice: p.offer_price != null ? toNumber(p.offer_price, 0) : null,
    unitType: normalizeUnitType(p.unit_type, 'unit'),
    unitLabel: readString(p.unit_label, 'piece'),
    baseQuantity: toNumber(p.base_quantity, 1),
    stockQuantity: toNumber(p.stock_quantity, 0),
    stockUnit: readString(p.stock_unit, 'piece'),
    allowDecimalQuantity: Boolean(p.allow_decimal_quantity),
    predefinedOptions: Array.isArray(p.predefined_options) ? p.predefined_options as QuantityOption[] : [],
    isActive: p.is_active !== false,
    sortOrder: toNumber(p.sort_order, 0),
    unit: readString(p.unit, '100g'),
    rating: toNumber(p.rating, 4.7),
    stock: Math.floor(toNumber(p.stock_quantity ?? p.stock, 0)),
    description: readString(p.description),
    descriptionTa: readString(p.description_ta),
    benefits: readString(p.benefits),
    benefitsTa: readString(p.benefits_ta),
    image,
    imageUrl: image,
    hasVariants: Boolean(p.has_variants),
    itemType: (p.item_type === 'service' ? 'service' : 'product') as 'product' | 'service',

    // POS inventory mapping
    sku: readString(p.sku),
    barcode: readString(p.barcode),
    brand: readString(p.brand),
    purchasePrice: toNumber(p.purchase_price, 0),
    mrp: toNumber(p.mrp, 0),
    gstPercent: toNumber(p.gst_percent, 0),
    openingStock: toNumber(p.opening_stock, 0),
    lowStockAlert: toNumber(p.low_stock_alert, 5),
    supplier: readString(p.supplier),
    size: readString(p.size),
    color: readString(p.color),
  }
}

// --- Auth Store ---
export const useAuthStore = create<AuthState>()(
  persist(
    (set, get): AuthState => ({
      user: null,
      loading: true,
      isAuthenticated: () => !!get().user,
      isAdmin: () => get().user?.role === 'admin',
      setAuth: (user: AuthUser | null) => set({ user, loading: false }),
      logout: async () => {
        try {
          await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {})
        } catch {}
        localStorage.removeItem('selvakkodi_auth_token')
        localStorage.removeItem('selvakkodi-admin-token')
        set({ user: null, loading: false })
      },
      initialize: async () => {
        set({ loading: true })
        try {
          // Check serverless /api/auth/me backed by Neon
          const token = localStorage.getItem('selvakkodi_auth_token') || localStorage.getItem('selvakkodi-admin-token')
          const headers: HeadersInit = {}
          if (token) {
            headers.Authorization = `Bearer ${token}`
          }

          const meRes = await fetch('/api/auth/me', {
            method: 'GET',
            headers,
            credentials: 'include',
          }).catch(() => null)

          if (meRes && meRes.ok) {
            const meJson = await meRes.json().catch(() => null)
            if (meJson?.success && meJson?.data?.user) {
              const u = meJson.data.user
              set({
                user: {
                  id: u.id,
                  name: u.name || 'Customer',
                  email: u.email || '',
                  mobile: u.mobile || '',
                  role: u.role === 'admin' ? 'admin' : 'customer',
                  avatarUrl: u.avatar_url || undefined,
                },
                loading: false,
              })
              return
            }
          }

          set({ user: null })
        } catch (e) {
          console.error('Auth init error', e)
          set({ user: null })
        } finally {
          set({ loading: false })
        }
      },
    }),
    { name: 'selvakkodi-auth' }
  )
)

// --- Product Store ---
export const useProductStore = create<ProductState>((set, get) => ({
  products: [],
  loading: false,
  error: null,
  lastFetch: 0,
  fetchProducts: async (force = false) => {
    if (!force && Date.now() - get().lastFetch < 300000 && get().products.length > 0) return

    set({ loading: true, error: null })
    try {
      const [{ data, error }, { data: categoryData }] = await Promise.all([
        fetchAllProducts(),
        fetchAllCategories(),
      ])

      if (error) throw new Error(error)

      const categoriesById = Object.fromEntries(
        (categoryData || []).map(category => [String(category.id), String(category.name_en || '').trim()]),
      )
      const normalized = (data || []).map(product => mapDbProduct(product, categoriesById))

      set({ products: normalized, loading: false, lastFetch: Date.now() })
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Unable to fetch products',
        loading: false,
      })
    }
  }
}))

// --- Cart Store ---
export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      addItem: (product, qty, unit, variantId, variantName, parentProductId) => {
        const items = [...get().items]
        const existing = items.find(i => i.id === product.id)

        const basePrice = product.offerPrice || product.price
        const lineTotal = calculateLineTotal(qty, product.unitType, product.baseQuantity, basePrice)

        if (existing) {
          existing.selectedUnit = unit
          const mergedQty = normalizeSelectedQuantity(
            existing.qty + qty,
            existing.unitType,
            existing.allowDecimalQuantity,
            1,
          )
          existing.qty = mergedQty
          existing.lineTotal = calculateLineTotal(mergedQty, existing.unitType, existing.baseQuantity, basePrice)
        } else {
          items.push({
            ...product,
            qty,
            selectedUnit: unit,
            basePrice,
            lineTotal,
            // Variant identity — only set for variant items
            variantId:       variantId       ?? undefined,
            variantName:     variantName     ?? undefined,
            parentProductId: parentProductId ?? undefined,

            // POS defaults
            cartItemId: Date.now().toString() + Math.random().toString(36).substr(2, 5),
            discountType: 'amount',
            discountValue: 0,
            gstRate: product.gstPercent || 0,
            gstAmount: ((product.gstPercent || 0) > 0) ? (lineTotal * (product.gstPercent || 0) / 100) : 0,
          })
        }
        set({ items })
      },
      removeItem: (id) => set({ items: get().items.filter(i => i.id !== id) }),
      updateQuantity: (id, qty) => {
        const items = get().items.map(item => {
          if (item.id === id) {
            const newQty = normalizeSelectedQuantity(
              qty,
              item.unitType,
              item.allowDecimalQuantity,
              1,
            )
            return {
              ...item,
              qty: newQty,
              lineTotal: calculateLineTotal(newQty, item.unitType, item.baseQuantity, item.basePrice)
            }
          }
          return item
        })
        set({ items })
      },
      clearCart: () => set({ items: [] }),
      totalItems: () => get().items.length,
      cartSubtotal: () => get().items.reduce((sum, item) => sum + item.lineTotal, 0),
      add: (product) => {
        const packLabel = product.predefinedOptions[0]?.label ?? product.unitLabel
        get().addItem(product, 1, packLabel)
      },
      remove: (productId) => get().removeItem(productId),
      updateQty: (productId, quantity) => get().updateQuantity(productId, quantity),
      clear: () => get().clearCart(),
      count: () => get().totalItems(),
      total: () => get().cartSubtotal(),
    }),
    { name: 'purple-boutique-cart' }
  )
)

export const useFavStore = create<FavState>()(
  persist(
    (set, get) => ({
      items: [],
      toggle: (product) => {
        const exists = get().items.some((p) => p.id === product.id)
        if (exists) {
          set({ items: get().items.filter((p) => p.id !== product.id) })
          return
        }
        set({ items: [...get().items, product] })
      },
      isFav: (productId) => get().items.some((p) => p.id === productId),
      clear: () => set({ items: [] }),
    }),
    { name: 'purple-boutique-favorites' },
  ),
)

export const useProductModalStore = create<ProductModalState>()((set) => ({
  product: null,
  open: false,
  openProduct: (product) => set({ product, open: true }),
  closeProduct: () => set({ open: false, product: null }),
}))

// --- Variant Store ---
export const useVariantStore = create<VariantStoreState>()((set, get) => ({
  variantsMap: {},
  fetched: false,
  fetchVariants: async () => {
    if (get().fetched) return
    const { data } = await fetchAllVariants()
    const map: Record<string, ProductVariant[]> = {}
    for (const v of data) {
      if (!map[v.productId]) map[v.productId] = []
      map[v.productId].push(v)
    }
    set({ variantsMap: map, fetched: true })
  },
  refetchVariants: async () => {
    set({ fetched: false })
    const { data } = await fetchAllVariants()
    const map: Record<string, ProductVariant[]> = {}
    for (const v of data) {
      if (!map[v.productId]) map[v.productId] = []
      map[v.productId].push(v)
    }
    set({ variantsMap: map, fetched: true })
  },
  getVariants: (productId) => get().variantsMap[String(productId)] || [],
  getDefaultVariant: (productId) => {
    const variants = get().variantsMap[String(productId)] || []
    return variants.find(v => v.isDefault) || variants[0] || null
  },
  hasVariants: (productId) => (get().variantsMap[String(productId)] || []).length > 0,
}))

// --- Variant Selector Modal Store ---
export const useVariantModalStore = create<VariantModalState>()((set) => ({
  product: null,
  open: false,
  openVariantModal: (product) => set({ product, open: true }),
  closeVariantModal: () => set({ open: false, product: null }),
}))

// --- Store Settings State ---
export const useSettingsStore = create<SettingsState>()((set) => ({
  settings: null,
  loading: false,
  fetchSettings: async () => {
    set({ loading: true })
    const { data, error } = await settingsService.fetchSettings()
    if (!error && data) {
      set({
        settings: {
          name: data.name,
          ownerName: data.ownerName,
          phone: data.phone,
          email: data.email,
          address: data.address,
          gstEnabled: data.gstEnabled,
          lowStockLimit: data.lowStockLimit ?? 5,
          instagram: data.instagram ?? 'selvakkodi_agro_service',
        },
        loading: false,
      })
      return
    }
    // Fallback/Demo settings
    set({
      settings: {
        name: BRAND_EN,
        ownerName: BRAND_OWNER,
        phone: BRAND_PHONE_DISPLAY,
        email: BRAND_EMAIL,
        address: BRAND_ADDRESS,
        gstEnabled: false,
        lowStockLimit: 5,
        instagram: BRAND_INSTAGRAM,
      },
      loading: false,
    })
  },
}))

// --- Admin Auth Store ---
const getEnv = (key: string, fallback: string) => {
  const val = import.meta.env[key] as string | undefined
  return val && val.trim() !== '' && val !== 'undefined' ? val.trim() : fallback
}

const ADMIN_PORTAL_ID = getEnv('VITE_ADMIN_ID', 'admin')
const STAFF_PORTAL_ID = getEnv('VITE_STAFF_ID', 'staff')

// Salted SHA-256 hashes for default credentials (no plaintext passwords in source code)
const DEFAULT_ADMIN_HASH = '6ac5fd41a1c6fae35cccd523c76644d8d1836d6cc79e692b3b1e7daca321435d'
const DEFAULT_STAFF_HASH = '6d39235ecd7e3a15165834379b2bc4a82d3b0cd405ac69026d411614b170e3b0'

const ADMIN_PORTAL_HASH = getEnv('VITE_ADMIN_PASSWORD_HASH', DEFAULT_ADMIN_HASH)
const STAFF_PORTAL_HASH = getEnv('VITE_STAFF_PASSWORD_HASH', DEFAULT_STAFF_HASH)

const hashCredential = async (id: string, pwd: string): Promise<string> => {
  const normalized = `sas_auth_v1:${id.trim().toLowerCase()}:${pwd.trim()}`
  const encoder = new TextEncoder()
  const data = encoder.encode(normalized)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

const safeCompare = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}

export type AdminRole = 'admin' | 'staff' | null

interface AdminAuthState {
  isLoggedIn: boolean
  role: AdminRole
  user?: {
    id?: string
    name?: string
    email?: string
    role?: string
    customer_code?: string
  } | null
  token?: string | null
  login: (portalId: string, password: string) => Promise<AdminRole | false>
  logout: () => void
}

export const useAdminAuthStore = create<AdminAuthState>()(
  persist(
    (set) => ({
      isLoggedIn: false,
      role: null,
      user: null,
      token: null,
      login: async (portalId: string, password: string) => {
        const id = portalId.trim()
        const pwd = password.trim()
        if (!id || !pwd) return false

        // 1. Primary: Serverless authentication against Neon API
        try {
          const res = await fetch('/api/auth/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ id, password: pwd }),
          })

          if (res.ok) {
            const data = await res.json().catch(() => null)
            if (data?.success && data?.data?.role) {
              const role = data.data.role as AdminRole
              const token = data.data.token || null
              const user = data.data.user || null
              if (token) {
                localStorage.setItem('selvakkodi-admin-token', token)
              }
              set({ isLoggedIn: true, role, user, token })
              return role
            }
          }
        } catch (serverErr) {
          console.warn('Server auth call unreachable, testing local fallback...', serverErr)
        }

        // 2. Fallback: Offline / dev environment credential check
        try {
          const attemptHash = await hashCredential(id.toLowerCase(), pwd)

          const customAdminPwd = getEnv('VITE_ADMIN_PASSWORD', '')
          const customStaffPwd = getEnv('VITE_STAFF_PASSWORD', '')

          const expectedAdminHash = customAdminPwd ? await hashCredential(ADMIN_PORTAL_ID, customAdminPwd) : ADMIN_PORTAL_HASH
          const expectedStaffHash = customStaffPwd ? await hashCredential(STAFF_PORTAL_ID, customStaffPwd) : STAFF_PORTAL_HASH

          if (id.toLowerCase() === ADMIN_PORTAL_ID.toLowerCase() && safeCompare(attemptHash, expectedAdminHash)) {
            set({
              isLoggedIn: true,
              role: 'admin',
              user: { name: 'Administrator', role: 'admin' },
              token: null,
            })
            return 'admin'
          }

          if (id.toLowerCase() === STAFF_PORTAL_ID.toLowerCase() && safeCompare(attemptHash, expectedStaffHash)) {
            set({
              isLoggedIn: true,
              role: 'staff',
              user: { name: 'Store Staff', role: 'staff' },
              token: null,
            })
            return 'staff'
          }
        } catch (e) {
          console.error('Auth verification error', e)
        }

        return false
      },
      logout: () => {
        try {
          fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {})
        } catch {}
        localStorage.removeItem('selvakkodi-admin-token')
        set({ isLoggedIn: false, role: null, user: null, token: null })
      },
    }),
    {
      name: 'selvakkodi-admin-session',
      storage: {
        getItem: (name) => {
          const str = sessionStorage.getItem(name) || sessionStorage.getItem('purple-boutique-admin-session')
          if (!str) return null
          return JSON.parse(str)
        },
        setItem: (name, value) => {
          sessionStorage.setItem(name, JSON.stringify(value))
        },
        removeItem: (name) => {
          sessionStorage.removeItem(name)
          sessionStorage.removeItem('purple-boutique-admin-session')
        }
      }
    }
  )
)
