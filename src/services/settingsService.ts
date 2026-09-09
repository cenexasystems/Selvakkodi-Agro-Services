/**
 * settingsService.ts
 * Communicates with the Vercel Serverless API (/api/settings) backed by Neon PostgreSQL.
 */
import { api } from './api'

export interface StoreSettings {
  id: number
  name: string
  ownerName: string
  phone: string
  email?: string
  address: string
  gstEnabled: boolean
  lowStockLimit: number
  instagram?: string
  updated_at?: string
}

export const settingsService = {
  async fetchSettings(): Promise<{ data: StoreSettings | null; error: string | null }> {
    try {
      const data = await api.getSettings()
      if (!data) return { data: null, error: null }
      return {
        data: {
          id: data.id ?? 1,
          name: data.name ?? 'Selvakkodi Agro Service',
          ownerName: data.ownerName ?? data.owner_name ?? '',
          phone: data.phone ?? '',
          email: data.email ?? '',
          address: data.address ?? '',
          gstEnabled: Boolean(data.gstEnabled ?? data.gst_enabled ?? false),
          lowStockLimit: Number(data.lowStockLimit ?? data.low_stock_limit ?? 5),
          instagram: data.instagram ?? 'selvakkodi_agro_service',
          updated_at: data.updated_at,
        },
        error: null,
      }
    } catch (err: any) {
      return { data: null, error: err.message || 'Failed to fetch settings' }
    }
  },

  async updateSettings(payload: Partial<StoreSettings>): Promise<{ data: StoreSettings | null; error: string | null }> {
    try {
      const data = await api.updateSettings(payload as Record<string, unknown>)
      return {
        data: {
          id: data.id ?? 1,
          name: data.name ?? 'Selvakkodi Agro Service',
          ownerName: data.ownerName ?? data.owner_name ?? '',
          phone: data.phone ?? '',
          email: data.email ?? '',
          address: data.address ?? '',
          gstEnabled: Boolean(data.gstEnabled ?? data.gst_enabled ?? false),
          lowStockLimit: Number(data.lowStockLimit ?? data.low_stock_limit ?? 5),
          instagram: data.instagram ?? 'selvakkodi_agro_service',
          updated_at: data.updated_at,
        },
        error: null,
      }
    } catch (err: any) {
      return { data: null, error: err.message || 'Failed to update settings' }
    }
  },
}
