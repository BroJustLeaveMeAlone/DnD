import { sql } from 'drizzle-orm';
import { getDatabase } from './client.js';

/**
 * Cheapest possible round-trip that proves the connection is live and the
 * credentials work. Exposed here so callers don't need to depend on drizzle-orm
 * directly — @ttrpg/db owns the ORM, nothing above it should reach past it.
 */
export async function pingDatabase(): Promise<void> {
  await getDatabase().execute(sql`select 1`);
}
