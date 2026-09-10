import type { VercelRequest, VercelResponse } from '@vercel/node';

// Static imports for all 54 route handlers
import healthHandler from './_routes/health.js';
import uploadHandler from './_routes/upload.js';

import advanceOrdersIndexHandler from './_routes/advance-orders/index.js';
import advanceOrdersIdHandler from './_routes/advance-orders/[id]/index.js';
import advanceOrdersCompleteHandler from './_routes/advance-orders/[id]/complete.js';
import advanceOrdersEventsHandler from './_routes/advance-orders/[id]/events.js';
import advanceOrdersHistoryHandler from './_routes/advance-orders/[id]/history.js';
import advanceOrdersStatusHandler from './_routes/advance-orders/[id]/status.js';

import attendanceIndexHandler from './_routes/attendance/index.js';
import attendancePunchHandler from './_routes/attendance/punch.js';

import authAdminLoginHandler from './_routes/auth/admin/login.js';
import authChangePasswordHandler from './_routes/auth/change-password.js';
import authLoginHandler from './_routes/auth/login.js';
import authLogoutHandler from './_routes/auth/logout.js';
import authMeHandler from './_routes/auth/me.js';
import authProfileHandler from './_routes/auth/profile.js';
import authRegisterHandler from './_routes/auth/register.js';

import categoriesIndexHandler from './_routes/categories/index.js';
import categoriesIdHandler from './_routes/categories/[id].js';

import couponsIndexHandler from './_routes/coupons/index.js';
import couponsValidateHandler from './_routes/coupons/validate.js';
import couponsIdHandler from './_routes/coupons/[id].js';

import expensesIndexHandler from './_routes/expenses/index.js';
import expensesIdHandler from './_routes/expenses/[id].js';
import expensesCategoriesIndexHandler from './_routes/expenses/categories/index.js';
import expensesCategoriesIdHandler from './_routes/expenses/categories/[id].js';

import filesIdHandler from './_routes/files/[id].js';

import inventoryAdjustStockHandler from './_routes/inventory/adjust-stock.js';
import inventoryLogsHandler from './_routes/inventory/logs.js';
import inventoryLowStockHandler from './_routes/inventory/low-stock.js';
import inventoryProductsHandler from './_routes/inventory/products.js';

import notificationsIndexHandler from './_routes/notifications/index.js';
import notificationsMarkReadHandler from './_routes/notifications/mark-read.js';
import notificationsIdHandler from './_routes/notifications/[id].js';

import ordersIndexHandler from './_routes/orders/index.js';
import ordersAnalyticsHandler from './_routes/orders/analytics.js';
import ordersMineHandler from './_routes/orders/mine.js';
import ordersIdHandler from './_routes/orders/[id]/index.js';
import ordersInvoicePdfHandler from './_routes/orders/[id]/invoice-pdf.js';
import ordersStatusHandler from './_routes/orders/[id]/status.js';

import productsIndexHandler from './_routes/products/index.js';
import productsIdHandler from './_routes/products/[id].js';

import reviewsIndexHandler from './_routes/reviews/index.js';
import reviewsIdHandler from './_routes/reviews/[id].js';

import settingsIndexHandler from './_routes/settings/index.js';
import setupSeedAdminHandler from './_routes/setup/seed-admin.js';

import staffIndexHandler from './_routes/staff/index.js';
import staffIdHandler from './_routes/staff/[id].js';

import usersIndexHandler from './_routes/users/index.js';
import usersIdHandler from './_routes/users/[id].js';

import variantsIndexHandler from './_routes/variants/index.js';
import variantsDefaultHandler from './_routes/variants/default.js';
import variantsIdHandler from './_routes/variants/[id].js';

type RouteHandler = (req: VercelRequest, res: VercelResponse) => Promise<any> | any;

function getSegments(req: VercelRequest): string[] {
  // 1. If Vercel passed path via catch-all [...path] query
  if (req.query && req.query.path) {
    if (Array.isArray(req.query.path)) {
      return req.query.path.map((s) => decodeURIComponent(s));
    }
    if (typeof req.query.path === 'string') {
      return req.query.path
        .split('/')
        .filter(Boolean)
        .map((s) => decodeURIComponent(s));
    }
  }

  // 2. Parse from req.url
  const rawUrl = req.url || '/';
  const pathname = rawUrl.split('?')[0] || '/';
  const cleanPath = pathname.replace(/^\/api\/?/, '').replace(/\/$/, '');
  if (!cleanPath) return [];
  return cleanPath
    .split('/')
    .filter(Boolean)
    .map((s) => decodeURIComponent(s));
}

function parseQueryParams(req: VercelRequest) {
  if (!req.query) {
    req.query = {};
  }
  const rawUrl = req.url || '';
  const queryString = rawUrl.includes('?') ? rawUrl.split('?')[1] : '';
  if (queryString) {
    const params = new URLSearchParams(queryString);
    for (const [key, value] of params.entries()) {
      if (req.query[key] === undefined) {
        req.query[key] = value;
      }
    }
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  parseQueryParams(req);
  const segments = getSegments(req);

  // Clean up internal catch-all query param if present
  if (req.query && 'path' in req.query) {
    delete req.query.path;
  }

  // 0 segments: /api or /api/
  if (segments.length === 0) {
    return healthHandler(req, res);
  }

  // 1 segment: /api/{resource}
  if (segments.length === 1) {
    const s0 = segments[0];
    switch (s0) {
      case 'health':
        return healthHandler(req, res);
      case 'inventory-logs':
        return inventoryLogsHandler(req, res);
      case 'upload':
        return uploadHandler(req, res);
      case 'advance-orders':
        return advanceOrdersIndexHandler(req, res);
      case 'attendance':
        return attendanceIndexHandler(req, res);
      case 'categories':
        return categoriesIndexHandler(req, res);
      case 'coupons':
        return couponsIndexHandler(req, res);
      case 'expenses':
        return expensesIndexHandler(req, res);
      case 'notifications':
        return notificationsIndexHandler(req, res);
      case 'orders':
        return ordersIndexHandler(req, res);
      case 'products':
        return productsIndexHandler(req, res);
      case 'reviews':
        return reviewsIndexHandler(req, res);
      case 'settings':
        return settingsIndexHandler(req, res);
      case 'staff':
        return staffIndexHandler(req, res);
      case 'users':
        return usersIndexHandler(req, res);
      case 'variants':
        return variantsIndexHandler(req, res);
      default:
        break;
    }
  }

  // 2 segments: /api/{resource}/{subresource_or_id}
  if (segments.length === 2) {
    const [s0, s1] = segments;

    // Static subresources
    if (s0 === 'attendance' && s1 === 'punch') return attendancePunchHandler(req, res);
    if (s0 === 'auth' && s1 === 'change-password') return authChangePasswordHandler(req, res);
    if (s0 === 'auth' && s1 === 'login') return authLoginHandler(req, res);
    if (s0 === 'auth' && s1 === 'logout') return authLogoutHandler(req, res);
    if (s0 === 'auth' && s1 === 'me') return authMeHandler(req, res);
    if (s0 === 'auth' && s1 === 'profile') return authProfileHandler(req, res);
    if (s0 === 'auth' && s1 === 'register') return authRegisterHandler(req, res);
    if (s0 === 'coupons' && s1 === 'validate') return couponsValidateHandler(req, res);
    if (s0 === 'expenses' && s1 === 'categories') return expensesCategoriesIndexHandler(req, res);
    if (s0 === 'inventory' && s1 === 'adjust-stock') return inventoryAdjustStockHandler(req, res);
    if (s0 === 'inventory' && s1 === 'logs') return inventoryLogsHandler(req, res);
    if (s0 === 'inventory' && s1 === 'low-stock') return inventoryLowStockHandler(req, res);
    if (s0 === 'inventory' && s1 === 'products') return inventoryProductsHandler(req, res);
    if (s0 === 'notifications' && s1 === 'mark-read') return notificationsMarkReadHandler(req, res);
    if (s0 === 'orders' && s1 === 'analytics') return ordersAnalyticsHandler(req, res);
    if (s0 === 'orders' && s1 === 'mine') return ordersMineHandler(req, res);
    if (s0 === 'setup' && s1 === 'seed-admin') return setupSeedAdminHandler(req, res);
    if (s0 === 'variants' && s1 === 'default') return variantsDefaultHandler(req, res);

    // Dynamic :id handlers
    req.query.id = s1;
    switch (s0) {
      case 'advance-orders':
        return advanceOrdersIdHandler(req, res);
      case 'categories':
        return categoriesIdHandler(req, res);
      case 'coupons':
        return couponsIdHandler(req, res);
      case 'expenses':
        return expensesIdHandler(req, res);
      case 'files':
        return filesIdHandler(req, res);
      case 'notifications':
        return notificationsIdHandler(req, res);
      case 'orders':
        return ordersIdHandler(req, res);
      case 'products':
        return productsIdHandler(req, res);
      case 'reviews':
        return reviewsIdHandler(req, res);
      case 'staff':
        return staffIdHandler(req, res);
      case 'users':
        return usersIdHandler(req, res);
      case 'variants':
        return variantsIdHandler(req, res);
      default:
        break;
    }
  }

  // 3 segments: /api/{resource}/{id_or_sub}/{action}
  if (segments.length === 3) {
    const [s0, s1, s2] = segments;

    if (s0 === 'auth' && s1 === 'admin' && s2 === 'login') {
      return authAdminLoginHandler(req, res);
    }

    if (s0 === 'expenses' && s1 === 'categories') {
      req.query.id = s2;
      return expensesCategoriesIdHandler(req, res);
    }

    if (s0 === 'advance-orders') {
      req.query.id = s1;
      if (s2 === 'complete') return advanceOrdersCompleteHandler(req, res);
      if (s2 === 'events') return advanceOrdersEventsHandler(req, res);
      if (s2 === 'history') return advanceOrdersHistoryHandler(req, res);
      if (s2 === 'status') return advanceOrdersStatusHandler(req, res);
    }

    if (s0 === 'orders') {
      req.query.id = s1;
      if (s2 === 'invoice-pdf') return ordersInvoicePdfHandler(req, res);
      if (s2 === 'status') return ordersStatusHandler(req, res);
    }
  }

  res.statusCode = 404;
  res.setHeader('Content-Type', 'application/json');
  return res.end(
    JSON.stringify({
      success: false,
      error: `API route not found: /api/${segments.join('/')}`,
    })
  );
}
