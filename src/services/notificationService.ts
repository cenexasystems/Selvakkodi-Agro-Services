/**
 * notificationService.ts
 * Frontend service for managing system notifications and user-facing feedback.
 * Backed by Vercel Serverless API (/api/notifications) & Neon PostgreSQL.
 */
import { api } from './api'

export type NotificationType =
  | 'low_stock'
  | 'out_of_stock'
  | 'order_created'
  | 'order_updated'
  | 'payment_received'
  | 'advance_order_updated'
  | 'inventory_adjusted'
  | 'general'

export interface AppNotification {
  id: string
  user_id?: string | null
  role_target?: string | null
  type: NotificationType
  title: string
  message: string
  data?: Record<string, unknown>
  is_read: boolean
  created_at: string
}

export const notificationService = {
  async fetchNotifications(): Promise<{ data: AppNotification[]; error: string | null }> {
    try {
      const rows = await api.getNotifications()
      return { data: rows || [], error: null }
    } catch (err: any) {
      return { data: [], error: err.message || 'Failed to fetch notifications' }
    }
  },

  async markAsRead(id: string): Promise<{ success: boolean; error: string | null }> {
    try {
      await api.markNotificationRead(id, true)
      return { success: true, error: null }
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to mark notification as read' }
    }
  },

  async markAllAsRead(): Promise<{ success: boolean; error: string | null }> {
    try {
      await api.markAllNotificationsRead()
      return { success: true, error: null }
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to mark all notifications as read' }
    }
  },

  async createNotification(payload: {
    title: string
    message: string
    type?: NotificationType
    role_target?: string
    user_id?: string
    data?: Record<string, unknown>
  }): Promise<{ data: AppNotification | null; error: string | null }> {
    try {
      const created = await api.createNotification(payload)
      return { data: created, error: null }
    } catch (err: any) {
      return { data: null, error: err.message || 'Failed to create notification' }
    }
  },
}
