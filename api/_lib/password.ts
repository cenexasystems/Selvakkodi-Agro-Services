import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const SALT_ROUNDS = 10;

/**
 * Hash a plain text password using bcrypt.
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Compare a plain text password with a stored hash (bcrypt or legacy SHA-256).
 */
export async function comparePassword(password: string, hash: string): Promise<boolean> {
  if (!password || !hash) return false;

  // 1. If it's a bcrypt hash (starts with $2a$, $2b$, or $2y$)
  if (hash.startsWith('$2a$') || hash.startsWith('$2b$') || hash.startsWith('$2y$')) {
    try {
      return await bcrypt.compare(password, hash);
    } catch {
      return false;
    }
  }

  // 2. Fallback check for legacy 64-char SHA-256 hex hash
  if (hash.length === 64) {
    const sha256Hash = crypto.createHash('sha256').update(password).digest('hex');
    if (crypto.timingSafeEqual(Buffer.from(sha256Hash), Buffer.from(hash))) {
      return true;
    }
  }

  // 3. Fallback direct equality check (for dev or unhashed seeds)
  return password === hash;
}
