import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema/index.js';

export type Database = ReturnType<typeof createDatabase>;

export function createDatabase(connectionString: string) {
  const pool = new Pool({ connectionString });
  // No `casing` option on purpose. Every column in the schema is named
  // explicitly, and drizzle-kit's config does not set casing — configuring it
  // here only would let runtime queries and generated migrations disagree the
  // moment someone adds a column without an explicit name.
  return drizzle(pool, { schema });
}

/**
 * Process-wide singleton.
 *
 * Next.js dev mode re-evaluates modules on every hot reload, which would leak a
 * new connection pool each time. Stashing it on globalThis keeps one pool alive
 * across reloads. In production this is just a lazy initialiser.
 */
const globalForDb = globalThis as unknown as { __ttrpgDb?: Database };

export function getDatabase(): Database {
  if (!globalForDb.__ttrpgDb) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL is not set. Copy .env.example to .env at the repo root.');
    }
    globalForDb.__ttrpgDb = createDatabase(connectionString);
  }
  return globalForDb.__ttrpgDb;
}
