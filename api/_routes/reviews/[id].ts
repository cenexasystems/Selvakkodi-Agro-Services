import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '../_lib/db.js';
import { ensureMethod, successResponse, errorResponse, parseBody } from '../_lib/response.js';
import { getAuthenticatedUser } from '../_lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!ensureMethod(req, res, ['GET', 'PATCH', 'PUT', 'DELETE'])) return;

  const { id } = req.query;
  if (!id || typeof id !== 'string') {
    return errorResponse(res, 'Review ID is required.', 400);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // GET: Single Review
  // ─────────────────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    try {
      const rows = await sql`
        SELECT id, user_id, name, location, rating, review_text, product_id, is_approved, created_at
        FROM public.store_reviews
        WHERE id = ${id}
      `;
      if (rows.length === 0) {
        return errorResponse(res, 'Review not found.', 404);
      }
      return successResponse(res, rows[0]);
    } catch (err: any) {
      console.error('Error fetching review:', err);
      return errorResponse(res, 'Failed to fetch review.', 500, { message: err.message });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PATCH / PUT: Moderate or Edit Review
  // Admin can moderate approval (is_approved).
  // Review owner can update review text or rating.
  // ─────────────────────────────────────────────────────────────────────────────
  if (req.method === 'PATCH' || req.method === 'PUT') {
    try {
      const user = await getAuthenticatedUser(req);
      if (!user) {
        return errorResponse(res, 'Authentication required to update review.', 401);
      }

      const existing = await sql`
        SELECT id, user_id, name, location, rating, review_text, is_approved
        FROM public.store_reviews
        WHERE id = ${id}
      `;
      if (existing.length === 0) {
        return errorResponse(res, 'Review not found.', 404);
      }
      const cur = existing[0];

      const isAdmin = user.role === 'admin';
      const isOwner = cur.user_id && cur.user_id === user.id;

      if (!isAdmin && !isOwner) {
        return errorResponse(res, 'You do not have permission to modify this review.', 403);
      }

      const body = parseBody<{
        is_approved?: boolean;
        rating?: number | string;
        review_text?: string;
        text?: string;
      }>(req);

      let isApproved = cur.is_approved;
      if (body.is_approved !== undefined) {
        if (!isAdmin) {
          return errorResponse(res, 'Only administrators can moderate review visibility.', 403);
        }
        isApproved = Boolean(body.is_approved);
      }

      let rating = cur.rating;
      if (body.rating !== undefined) {
        const num = parseInt(String(body.rating), 10);
        if (isNaN(num) || num < 1 || num > 5) {
          return errorResponse(res, 'Rating must be between 1 and 5.', 400);
        }
        rating = num;
      }

      const rawText = body.review_text || body.text;
      let reviewText = cur.review_text;
      if (rawText !== undefined) {
        const trimmed = String(rawText).trim();
        if (!trimmed) {
          return errorResponse(res, 'Review text cannot be empty.', 400);
        }
        if (trimmed.length > 1000) {
          return errorResponse(res, 'Review text cannot exceed 1000 characters.', 400);
        }
        reviewText = trimmed;
      }

      const updated = await sql`
        UPDATE public.store_reviews
        SET 
          is_approved = ${isApproved},
          rating = ${rating},
          review_text = ${reviewText},
          updated_at = NOW()
        WHERE id = ${id}
        RETURNING id, user_id, name, location, rating, review_text, product_id, is_approved, created_at, updated_at
      `;

      return successResponse(res, updated[0]);
    } catch (err: any) {
      console.error('Error updating review:', err);
      return errorResponse(res, 'Failed to update review.', 500, { message: err.message });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // DELETE: Remove Review
  // Admin or review owner only.
  // ─────────────────────────────────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    try {
      const user = await getAuthenticatedUser(req);
      if (!user) {
        return errorResponse(res, 'Authentication required to delete review.', 401);
      }

      const existing = await sql`
        SELECT id, user_id FROM public.store_reviews WHERE id = ${id}
      `;
      if (existing.length === 0) {
        return errorResponse(res, 'Review not found.', 404);
      }

      const isAdmin = user.role === 'admin';
      const isOwner = existing[0].user_id && existing[0].user_id === user.id;

      if (!isAdmin && !isOwner) {
        return errorResponse(res, 'You do not have permission to delete this review.', 403);
      }

      await sql`DELETE FROM public.store_reviews WHERE id = ${id}`;

      return successResponse(res, { message: 'Review deleted successfully.' });
    } catch (err: any) {
      console.error('Error deleting review:', err);
      return errorResponse(res, 'Failed to delete review.', 500, { message: err.message });
    }
  }
}
