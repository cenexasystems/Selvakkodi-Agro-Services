import { neon, NeonQueryFunction } from '@neondatabase/serverless';
import dns from 'node:dns';

// Ensure Node.js prioritizes IPv4 DNS resolution on Windows / dual-stack networks
try {
  if (dns && typeof dns.setDefaultResultOrder === 'function') {
    dns.setDefaultResultOrder('ipv4first');
  }
} catch {
  // Ignore in environments where node:dns is unavailable or restricted
}

let client: NeonQueryFunction<false, false> | null = null;

export function getDb(): NeonQueryFunction<false, false> {
  if (!client) {
    const connectionString = process.env.DATABASE_URL || process.env.DATABASE_URL_UNPOOLED;
    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is missing.');
    }
    client = neon(connectionString);
  }
  return client;
}

function isTransientNetworkError(err: any): boolean {
  if (!err) return false;
  const msg = String(err.message || '').toLowerCase();
  const code = String(err.code || err.cause?.code || '').toUpperCase();
  const causeMsg = String(err.cause?.message || '').toLowerCase();

  return (
    code === 'ENOTFOUND' ||
    code === 'ECONNRESET' ||
    code === 'ECONNREFUSED' ||
    code === 'ETIMEDOUT' ||
    code === 'EAI_AGAIN' ||
    msg.includes('fetch failed') ||
    causeMsg.includes('enotfound') ||
    causeMsg.includes('getaddrinfo')
  );
}

async function executeWithRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err: any) {
      attempt++;
      if (attempt <= maxRetries && isTransientNetworkError(err)) {
        const delay = attempt * 350;
        console.warn(`[Neon DB] Transient network/DNS glitch (${err.cause?.code || err.code || err.message}). Retrying in ${delay}ms (attempt ${attempt}/${maxRetries})...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw err;
    }
  }
}

/**
 * Execute tagged template SQL queries against Neon PostgreSQL with transient error retry.
 * Example: const rows = await sql`SELECT * FROM users WHERE id = ${id}`;
 */
export const sql: NeonQueryFunction<false, false> & { query: any; transaction: any } = Object.assign(
  ((strings: any, ...values: any[]) => {
    const db = getDb();
    return executeWithRetry(() => (db as any)(strings, ...values));
  }) as any,
  {
    query: (queryText: string, params?: any[], options?: any) => {
      const db = getDb();
      return executeWithRetry(() => (db as any).query(queryText, params, options));
    },
    transaction: (...args: any[]) => {
      const db = getDb();
      return (db as any).transaction(...args);
    },
  }
);
