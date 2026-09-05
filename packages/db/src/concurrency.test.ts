import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { beforeAll, describe, expect, it } from 'vitest';
import { type Database, createDatabase } from './client.js';
import { ensureSystemAccount } from './seed.js';
import { findOrCreateUser } from './sessions.js';

config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });

const connectionString = process.env.DATABASE_URL;
const describeDb = connectionString ? describe : describe.skip;
const unique = () => Math.random().toString(36).slice(2, 8);

/**
 * Regression tests for a check-then-act race.
 *
 * Both helpers originally did a select followed by an insert. Vitest runs test
 * files in parallel, so several could each find no row and each try to insert,
 * and all but one failed on the unique constraint. It passed locally, where the
 * row already existed from an earlier run, and failed in CI against a fresh
 * database — the sort of bug that only appears where it costs the most.
 */
describeDb('concurrent account creation', () => {
  let db: Database;

  beforeAll(() => {
    db = createDatabase(connectionString!);
  });

  it('ensureSystemAccount survives simultaneous callers', async () => {
    const results = await Promise.all(Array.from({ length: 8 }, () => ensureSystemAccount(db)));

    // Every caller must succeed, and all must agree on the same account.
    expect(results).toHaveLength(8);
    expect(new Set(results).size).toBe(1);
  });

  it('findOrCreateUser survives simultaneous callers for one email', async () => {
    const email = `race-${unique()}@test.local`;
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        findOrCreateUser(db, { email, name: 'Racer', handle: `racer-${unique()}-${i}` }),
      ),
    );

    expect(new Set(results).size).toBe(1);
  });

  it('does not overwrite an existing name on a later call', async () => {
    // This is find-or-create; signing in again must not rewrite your profile.
    const email = `stable-${unique()}@test.local`;
    const first = await findOrCreateUser(db, { email, name: 'Original', handle: `h-${unique()}` });
    const second = await findOrCreateUser(db, {
      email,
      name: 'Replacement',
      handle: `h-${unique()}`,
    });

    expect(second).toBe(first);

    const { users } = await import('./schema/index.js');
    const { eq } = await import('drizzle-orm');
    const [row] = await db.select({ name: users.name }).from(users).where(eq(users.id, first));
    expect(row?.name).toBe('Original');
  });
});
