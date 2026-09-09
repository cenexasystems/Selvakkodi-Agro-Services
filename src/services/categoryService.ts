/**
 * categoryService.ts
 * Manages category operations via Vercel Serverless API (/api/categories).
 */
import { api } from './api'

export interface Category {
  id: string | number
  name_en: string
  name_ta?: string
  is_active: boolean
  sort_order?: number
  created_at?: string
  updated_at?: string
}

export const categoryService = {
  async fetchCategories(activeOnly = false): Promise<{ data: Category[]; error: string | null }> {
    try {
      const data = await api.getCategories(activeOnly ? 'active=true' : '')
      const mapped = (data || []).map((c: any) => ({
        ...c,
        is_active: c.is_active !== false,
      })) as Category[]
      return { data: mapped, error: null }
    } catch (err: any) {
      return { data: [], error: err.message || 'Failed to fetch categories' }
    }
  },

  async createCategory(payload: {
    name_en: string
    name_ta?: string
    is_active?: boolean
    sort_order?: number
  }): Promise<{ data: Category | null; error: string | null }> {
    try {
      const data = await api.createCategory(payload)
      return { data: data as Category, error: null }
    } catch (err: any) {
      return { data: null, error: err.message || 'Failed to create category' }
    }
  },

  async updateCategory(
    id: string | number,
    payload: Partial<{
      name_en: string
      name_ta: string
      is_active: boolean
      sort_order: number
    }>
  ): Promise<{ data: Category | null; error: string | null }> {
    try {
      const data = await api.updateCategory(id, payload)
      return { data: data as Category, error: null }
    } catch (err: any) {
      return { data: null, error: err.message || 'Failed to update category' }
    }
  },

  async deleteCategory(id: string | number): Promise<{ error: string | null }> {
    try {
      await api.deleteCategory(id)
      return { error: null }
    } catch (err: any) {
      return { error: err.message || 'Failed to delete category' }
    }
  },

  async reorderCategories(
    items: Array<{ id: string | number; sort_order: number }>
  ): Promise<{ error: string | null }> {
    try {
      await Promise.all(
        items.map(item => api.updateCategory(item.id, { sort_order: item.sort_order }))
      )
      return { error: null }
    } catch (err: any) {
      return { error: err.message || 'Failed to reorder categories' }
    }
  },
}
