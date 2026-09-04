import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

// Resolved against this file, not the process CWD, so the script works no
// matter where it is invoked from.
config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set. Copy .env.example to .env at the repo root.');
}

const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));
const pool = new Pool({ connectionString });

try {
  await migrate(drizzle(pool), { migrationsFolder });
  console.log('Migrations applied.');
} finally {
  await pool.end();
}
