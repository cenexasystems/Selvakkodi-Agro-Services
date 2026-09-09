import type { VercelRequest, VercelResponse } from '@vercel/node';
import jwt from 'jsonwebtoken';
import { parseCookie, stringifySetCookie } from 'cookie';
import crypto from 'crypto';
import { sql } from './db.js';
import { errorResponse } from './response.js';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-dev-secret-selvakkodi-agro-services-2026';
const TOKEN_EXPIRY_SECONDS = 7 * 24 * 60 * 60; // 7 days
export const AUTH_COOKIE_NAME = 'selvakkodi_auth_token';

export interface AuthUser {
  id: string;
  customer_code?: string;
  name: string;
  email: string;
  mobile?: string;
  role: 'admin' | 'staff' | 'customer';
  avatar_url?: string;
  raw_user_meta_data?: any;
}

export interface AuthTokenPayload {
  userId: string;
  email: string;
  role: 'admin' | 'staff' | 'customer';
  name: string;
}

/**
 * Hash a token string for safe storage in the sessions table.
 */
function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Sign a JWT token.
 */
export function signJwtToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: TOKEN_EXPIRY_SECONDS,
  });
}

/**
 * Verify and decode a JWT token.
 */
export function verifyJwtToken(token: string): AuthTokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as AuthTokenPayload;
  } catch {
    return null;
  }
}

/**
 * Extract auth token from cookie or Authorization Bearer header.
 */
export function getAuthToken(req: VercelRequest): string | null {
  // 1. From Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }

  // 2. From Cookie header
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    const cookies = parseCookie(cookieHeader);
    if (cookies[AUTH_COOKIE_NAME]) {
      return cookies[AUTH_COOKIE_NAME] as string;
    }
  }

  return null;
}

/**
 * Set the authentication cookie on the response.
 */
export function setAuthCookie(res: VercelResponse, token: string): void {
  const isProd = process.env.NODE_ENV === 'production';
  const serialized = stringifySetCookie({
    name: AUTH_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    maxAge: TOKEN_EXPIRY_SECONDS,
    path: '/',
  });
  res.setHeader('Set-Cookie', serialized);
}

/**
 * Clear the authentication cookie.
 */
export function clearAuthCookie(res: VercelResponse): void {
  const isProd = process.env.NODE_ENV === 'production';
  const serialized = stringifySetCookie({
    name: AUTH_COOKIE_NAME,
    value: '',
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  });
  res.setHeader('Set-Cookie', serialized);
}

/**
 * Record a session in the database.
 */
export async function recordSession(
  userId: string,
  token: string,
  req: VercelRequest
): Promise<void> {
  try {
    const tokenHash = hashToken(token);
    const ip = (req.headers['x-forwarded-for'] as string) || req.socket?.remoteAddress || 'unknown';
    const userAgent = (req.headers['user-agent'] as string) || 'unknown';
    const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_SECONDS * 1000).toISOString();

    await sql`
      INSERT INTO public.sessions (user_id, token_hash, ip_address, user_agent, expires_at)
      VALUES (${userId}, ${tokenHash}, ${ip}, ${userAgent}, ${expiresAt})
    `;
  } catch (err) {
    console.error('Failed to record session:', err);
  }
}

/**
 * Revoke a session in the database.
 */
export async function revokeSession(token: string): Promise<void> {
  try {
    const tokenHash = hashToken(token);
    await sql`
      DELETE FROM public.sessions
      WHERE token_hash = ${tokenHash}
    `;
  } catch (err) {
    console.error('Failed to revoke session:', err);
  }
}

/**
 * Authenticate request and return the full user record.
 */
export async function getAuthenticatedUser(req: VercelRequest): Promise<AuthUser | null> {
  const token = getAuthToken(req);
  if (!token) return null;

  const payload = verifyJwtToken(token);
  if (!payload || !payload.userId) return null;

  try {
    const rows = await sql`
      SELECT id, customer_code, name, email, mobile, role, avatar_url, raw_user_meta_data
      FROM public.users
      WHERE id = ${payload.userId}
      LIMIT 1
    `;

    if (!rows || rows.length === 0) return null;
    return rows[0] as AuthUser;
  } catch (err) {
    console.error('Error fetching authenticated user:', err);
    return null;
  }
}

/**
 * Guard function: ensures user is authenticated, otherwise sends 401.
 */
export async function requireAuth(
  req: VercelRequest,
  res: VercelResponse
): Promise<AuthUser | null> {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    errorResponse(res, 'Authentication required. Please log in.', 401);
    return null;
  }
  return user;
}

/**
 * Guard function: ensures user has one of the allowed roles, otherwise sends 403.
 */
export async function requireRole(
  req: VercelRequest,
  res: VercelResponse,
  allowedRoles: Array<'admin' | 'staff' | 'customer'>
): Promise<AuthUser | null> {
  const user = await requireAuth(req, res);
  if (!user) return null;

  if (!allowedRoles.includes(user.role)) {
    errorResponse(res, `Forbidden. Role '${user.role}' lacks required permissions.`, 403);
    return null;
  }
  return user;
}
