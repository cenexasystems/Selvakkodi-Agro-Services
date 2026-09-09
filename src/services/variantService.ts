/**
 * variantService.ts
 * Communicates with the Vercel Serverless API (/api/variants) backed by Neon PostgreSQL.
 */
import { api } from './api'

export type ProductVariant = {
  id: string
  productId: string
  variantName: string
  sizeLabel: string | null   // display label: "25g", "250ml", "Cycle Brand"
  weightValue: number | null // numeric for filtering
  weightUnit: string | null  // "g", "ml", "kg", "L"
  sku: string | null
  barcode: string | null
  purchasePrice: number | null
  mrp: number | null
  price: number
  stock: number
  isDefault: boolean
  isActive: boolean
  sortOrder: number
  imageUrl: string | null
  groupName: string | null   // Brand name for Type D (Brand+Weight) products e.g. "Sithanathan"
}

export type VariantInput = {
  productId: string
  variantName: string
  sizeLabel?: string | null
  weightValue?: number | null
  weightUnit?: string | null
  sku?: string | null
  barcode?: string | null
  purchasePrice?: number | null
  mrp?: number | null
  price: number
  stock: number
  isDefault?: boolean
  sortOrder?: number
  imageUrl?: string | null
}

function mapVariant(r: Record<string, unknown>): ProductVariant {
  return {
    id:          String(r.id || ''),
    productId:   String(r.product_id ?? r.productId ?? ''),
    variantName: String(r.variant_name ?? r.variantName ?? ''),
    sizeLabel:   (r.size_label ?? r.sizeLabel) ? String(r.size_label ?? r.sizeLabel) : null,
    weightValue: (r.weight_value ?? r.weightValue) != null ? Number(r.weight_value ?? r.weightValue) : null,
    weightUnit:  (r.weight_unit ?? r.weightUnit) ? String(r.weight_unit ?? r.weightUnit) : null,
    sku:         (r.sku) ? String(r.sku) : null,
    barcode:     (r.barcode) ? String(r.barcode) : null,
    purchasePrice: (r.purchase_price ?? r.purchasePrice) != null ? Number(r.purchase_price ?? r.purchasePrice) : null,
    mrp:         (r.mrp) != null ? Number(r.mrp) : null,
    price:       Number(r.price ?? 0),
    stock:       Number(r.stock ?? 0),
    isDefault:   (r.is_default ?? r.isDefault) === true,
    isActive:    (r.is_active ?? r.isActive) !== false,
    sortOrder:   Number(r.sort_order ?? r.sortOrder ?? 0),
    imageUrl:    (r.image_url ?? r.imageUrl) ? String(r.image_url ?? r.imageUrl) : null,
    groupName:   (r.group_name ?? r.groupName) ? String(r.group_name ?? r.groupName) : null,
  }
}

// ── Read ──────────────────────────────────────────────────────────

export async function fetchAllVariants(): Promise<{ data: ProductVariant[]; error: string | null }> {
  try {
    const data = await api.getVariants()
    return {
      data: (data || []).map(r => mapVariant(r as Record<string, unknown>)),
      error: null,
    }
  } catch (err: any) {
    return { data: [], error: err.message || 'Failed to fetch variants' }
  }
}

export async function fetchVariantsByProduct(productId: string): Promise<ProductVariant[]> {
  try {
    const data = await api.getVariants(`productId=${encodeURIComponent(productId)}`)
    return (data || []).map(r => mapVariant(r as Record<string, unknown>))
  } catch (err) {
    console.error('Failed to fetch variants for product:', err)
    return []
  }
}

// ── Write (admin/staff) ───────────────────────────────────────────

export async function createVariant(input: VariantInput): Promise<{ data: ProductVariant | null; error: string | null }> {
  try {
    const data = await api.createVariant({
      productId:   input.productId,
      variantName: input.variantName,
      sizeLabel:   input.sizeLabel ?? null,
      weightValue: input.weightValue ?? null,
      weightUnit:  input.weightUnit ?? null,
      sku:          input.sku ?? null,
      barcode:      input.barcode ?? null,
      purchasePrice: input.purchasePrice ?? null,
      mrp:          input.mrp ?? null,
      price:        input.price,
      stock:        input.stock,
      isDefault:   input.isDefault ?? false,
      sortOrder:   input.sortOrder ?? 0,
      imageUrl:    input.imageUrl ?? null,
    })
    return { data: data ? mapVariant(data as Record<string, unknown>) : null, error: null }
  } catch (err: any) {
    return { data: null, error: err.message || 'Failed to create variant' }
  }
}

export async function updateVariant(
  id: string,
  updates: Partial<VariantInput>,
): Promise<{ error: string | null }> {
  try {
    await api.updateVariant(id, updates as Record<string, unknown>)
    return { error: null }
  } catch (err: any) {
    return { error: err.message || 'Failed to update variant' }
  }
}

export async function deleteVariant(id: string): Promise<{ error: string | null }> {
  try {
    await api.deleteVariant(id)
    return { error: null }
  } catch (err: any) {
    return { error: err.message || 'Failed to delete variant' }
  }
}

export async function setDefaultVariant(
  variantId: string,
  productId: string,
): Promise<{ error: string | null }> {
  try {
    await api.setDefaultVariant(variantId, productId)
    return { error: null }
  } catch (err: any) {
    return { error: err.message || 'Failed to set default variant' }
  }
}
