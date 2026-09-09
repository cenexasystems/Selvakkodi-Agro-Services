import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '../_lib/db.js';
import { ensureMethod, successResponse, errorResponse, parseBody } from '../_lib/response.js';
import { getAuthenticatedUser } from '../_lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!ensureMethod(req, res, ['GET', 'POST'])) return;

  // ─────────────────────────────────────────────────────────────────────────────
  // GET: List Reviews
  // Public users receive approved reviews.
  // Admins can pass ?all=true to view all reviews including unapproved.
  // Can filter by ?product_id=...
  // ─────────────────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    try {
      const user = await getAuthenticatedUser(req);
      const isAdmin = user && user.role === 'admin';
      const showAll = isAdmin && req.query.all === 'true';
      const productId = req.query.product_id ? String(req.query.product_id).trim() : null;
      const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '20'), 10)));

      let rows;
      if (productId) {
        if (showAll) {
          rows = await sql`
            SELECT 
              id, user_id, name, location, rating, review_text, product_id, is_approved, created_at
            FROM public.store_reviews
            WHERE product_id = ${productId}::bigint
            ORDER BY created_at DESC
            LIMIT ${limit}
          `;
        } else {
          rows = await sql`
            SELECT 
              id, user_id, name, location, rating, review_text, product_id, is_approved, created_at
            FROM public.store_reviews
            WHERE product_id = ${productId}::bigint AND is_approved = true
            ORDER BY created_at DESC
            LIMIT ${limit}
          `;
        }
      } else {
        if (showAll) {
          rows = await sql`
            SELECT 
              id, user_id, name, location, rating, review_text, product_id, is_approved, created_at
            FROM public.store_reviews
            ORDER BY created_at DESC
            LIMIT ${limit}
          `;
        } else {
          rows = await sql`
            SELECT 
              id, user_id, name, location, rating, review_text, product_id, is_approved, created_at
            FROM public.store_reviews
            WHERE is_approved = true
            ORDER BY created_at DESC
            LIMIT ${limit}
          `;
        }
      }

      return successResponse(res, rows);
    } catch (err: any) {
      console.error('Error fetching reviews:', err);
      return errorResponse(res, 'Failed to fetch reviews.', 500, { message: err.message });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // POST: Submit Review
  // Authenticated customer/user identity derived from session; or verified guest.
  // ─────────────────────────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    try {
      const user = await getAuthenticatedUser(req);

      const body = parseBody<{
        name?: string;
        location?: string;
        rating?: number | string;
        review_text?: string;
        text?: string;
        product_id?: number | string;
      }>(req);

      // Validate review text (support both review_text and text aliases)
      const rawText = body.review_text || body.text;
      if (!rawText || typeof rawText !== 'string' || !rawText.trim()) {
        return errorResponse(res, 'Review text is required.', 400);
      }
      const reviewText = rawText.trim();
      if (reviewText.length > 1000) {
        return errorResponse(res, 'Review text cannot exceed 1000 characters.', 400);
      }

      // Validate rating
      const rating = parseInt(String(body.rating), 10);
      if (isNaN(rating) || rating < 1 || rating > 5) {
        return errorResponse(res, 'Rating must be an integer between 1 and 5.', 400);
      }

      // Name: derive from authenticated user or form
      let name = body.name && typeof body.name === 'string' ? body.name.trim() : '';
      if (user && !name) {
        name = user.name || 'Customer';
      }
      if (!name) {
        return errorResponse(res, 'Reviewer name is required.', 400);
      }

      const location = body.location && typeof body.location === 'string'
        ? body.location.trim()
        : 'Tamil Nadu';

      const userId = user ? user.id : null;

      let productId: number | null = null;
      if (body.product_id !== undefined && body.product_id !== null && body.product_id !== '') {
        const pId = parseInt(String(body.product_id), 10);
        if (isNaN(pId) || pId <= 0) {
          return errorResponse(res, 'Invalid product ID.', 400);
        }
        const prodCheck = await sql`SELECT id FROM public.products WHERE id = ${pId}`;
        if (prodCheck.length === 0) {
          return errorResponse(res, 'Referenced product does not exist.', 404);
        }
        productId = pId;
      }

      const inserted = await sql`
        INSERT INTO public.store_reviews (
          user_id, name, location, rating, review_text, product_id, is_approved, created_at, updated_at
        ) VALUES (
          ${userId}, ${name}, ${location}, ${rating}, ${reviewText}, ${productId}, true, NOW(), NOW()
        )
        RETURNING id, user_id, name, location, rating, review_text, product_id, is_approved, created_at
      `;

      return successResponse(res, inserted[0], 201);
    } catch (err: any) {
      console.error('Error submitting review:', err);
      return errorResponse(res, 'Failed to submit review.', 500, { message: err.message });
    }
  }
}
