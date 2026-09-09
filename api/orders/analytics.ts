import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '../_lib/db.js';
import { ensureMethod, successResponse, errorResponse } from '../_lib/response.js';
import { requireRole } from '../_lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!ensureMethod(req, res, ['GET'])) return;

  const user = await requireRole(req, res, ['admin', 'staff']);
  if (!user) return;

  try {
    const summary = await sql`
      SELECT
        COUNT(*)::int AS total_orders,
        COUNT(*) FILTER (WHERE status = 'completed')::int AS completed_orders,
        COUNT(*) FILTER (WHERE status = 'pending')::int AS pending_orders,
        COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled_orders,
        COALESCE(SUM(total) FILTER (WHERE status = 'completed'), 0)::numeric(12,2) AS total_revenue,
        COUNT(*) FILTER (WHERE status = 'completed' AND created_at >= CURRENT_DATE)::int AS today_orders,
        COALESCE(SUM(total) FILTER (WHERE status = 'completed' AND created_at >= CURRENT_DATE), 0)::numeric(12,2) AS today_revenue
      FROM public.orders
    `;

    const channelStats = await sql`
      SELECT
        COALESCE(order_type, 'pos_sale') AS order_type,
        COALESCE(order_mode, 'offline') AS order_mode,
        COUNT(*)::int AS order_count,
        COALESCE(SUM(total) FILTER (WHERE status = 'completed'), 0)::numeric(12,2) AS revenue
      FROM public.orders
      GROUP BY order_type, order_mode
    `;

    const recentOrders = await sql`
      SELECT id, invoice_no, customer_name, phone, total, status, order_type, created_at
      FROM public.orders
      ORDER BY created_at DESC
      LIMIT 10
    `;

    const row = summary[0] || {};
    const totalRevenue = Number(row.total_revenue || 0);
    const completedOrders = Number(row.completed_orders || 0);
    const todayRevenue = Number(row.today_revenue || 0);
    const todayOrders = Number(row.today_orders || 0);

    const avgOrderValue = completedOrders > 0 ? Math.round((totalRevenue / completedOrders) * 100) / 100 : 0;
    const todayAvgOrderValue = todayOrders > 0 ? Math.round((todayRevenue / todayOrders) * 100) / 100 : 0;

    return successResponse(res, {
      totalOrders: Number(row.total_orders || 0),
      completedOrders,
      pendingOrders: Number(row.pending_orders || 0),
      cancelledOrders: Number(row.cancelled_orders || 0),
      totalRevenue,
      todayOrders,
      todayRevenue,
      averageOrderValue: avgOrderValue,
      todayAvgOrderValue,
      channelBreakdown: channelStats,
      recentOrders,
    });
  } catch (err: any) {
    console.error('Error fetching order analytics:', err);
    return errorResponse(res, 'Failed to fetch order analytics.', 500, { message: err.message });
  }
}
