import { neon } from '@neondatabase/serverless';
import fs from 'node:fs';

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('DATABASE_URL is missing in environment');
  process.exit(1);
}

const sql = neon(dbUrl);

async function run() {
  const migrationPath = './api/_db/001_sessions.sql';
  const query = fs.readFileSync(migrationPath, 'utf8');
  console.log('Executing migration 001_sessions.sql...');
  
  const statements = query
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);

  for (const stmt of statements) {
    console.log('Executing statement:', stmt.slice(0, 50), '...');
    await sql.query(stmt);
  }
  
  console.log('Verifying sessions table...');
  const res = await sql`
    SELECT table_name, column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'sessions' 
    ORDER BY ordinal_position;
  `;
  console.log('Sessions columns successfully verified:');
  console.log(JSON.stringify(res, null, 2));
}

run().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
