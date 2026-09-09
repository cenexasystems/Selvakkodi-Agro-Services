import type { VercelRequest, VercelResponse } from '@vercel/node';

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  details?: any;
}

export function setCorsHeaders(req: VercelRequest, res: VercelResponse): boolean {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}

export function ensureMethod(
  req: VercelRequest,
  res: VercelResponse,
  allowedMethods: string[]
): boolean {
  if (setCorsHeaders(req, res)) {
    return false;
  }

  if (!req.method || !allowedMethods.includes(req.method.toUpperCase())) {
    res.setHeader('Allow', allowedMethods.join(', '));
    res.status(405).json({
      success: false,
      error: `Method ${req.method} Not Allowed. Supported methods: ${allowedMethods.join(', ')}`,
    });
    return false;
  }
  return true;
}

export function successResponse<T>(
  res: VercelResponse,
  data?: T,
  status: number = 200,
  message?: string
): void {
  const body: ApiResponse<T> = { success: true };
  if (data !== undefined) body.data = data;
  if (message) body.message = message;
  res.status(status).json(body);
}

export function errorResponse(
  res: VercelResponse,
  error: string,
  status: number = 400,
  details?: any
): void {
  const body: ApiResponse = {
    success: false,
    error,
    ...(details ? { details } : {}),
  };
  res.status(status).json(body);
}

export function parseBody<T = any>(req: VercelRequest): T {
  if (!req.body) return {} as T;
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body) as T;
    } catch {
      return {} as T;
    }
  }
  return req.body as T;
}
