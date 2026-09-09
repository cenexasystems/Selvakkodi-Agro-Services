import { neon, NeonQueryFunction } from '@neondatabase/serverless';

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

/**
 * Execute tagged template SQL queries against Neon PostgreSQL.
 * Example: const rows = await sql`SELECT * FROM users WHERE id = ${id}`;
 */
export const sql: NeonQueryFunction<false, false> = ((strings: any, ...values: any[]) => {
  const db = getDb();
  return db(strings, ...values);
}) as NeonQueryFunction<false, false>;
