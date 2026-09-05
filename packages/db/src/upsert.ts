import { eq } from 'drizzle-orm';
import type { Database } from './client.js';
import { users } from './schema/index.js';

/**
 * Find-or-create for users, safe against concurrent callers.
 *
 * `ON CONFLICT` cannot express "conflict on either of two constraints", and
 * `users` is unique on both `email` and `handle`. Two callers inserting the
 * same account collide on whichever constraint the row hits first, so naming
 * one target leaves the other unhandled.
 *
 * So: try the insert, and treat a unique violation as "someone else won the
 * race" rather than an error. The follow-up read is the same query the caller
 * would have made anyway.
 *
 * The earlier version did select-then-insert, which is a check-then-act race:
 * every concurrent caller finds no row, every one inserts, all but one fail. It
 * passed locally, where a row survived from a previous run, and failed in CI
 * against a fresh database.
 */

const UNIQUE_VIOLATION = '23505';

/** Drizzle wraps driver errors, so the pg code can be one or two levels down. */
function isUniqueViolation(error: unknown): boolean {
  for (let current: unknown = error, depth = 0; current && depth < 4; depth += 1) {
    if (typeof current === 'object' && 'code' in current && current.code === UNIQUE_VIOLATION) {
      return true;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

async function idByEmail(db: Database, email: string): Promise<string | undefined> {
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  return row?.id;
}

export interface UserSeed {
  email: string;
  name: string;
  handle: string;
}

export async function findOrCreateUserRow(db: Database, input: UserSeed): Promise<string> {
  // The common path: the row already exists, and no write is attempted.
  const existing = await idByEmail(db, input.email);
  if (existing) return existing;

  try {
    const [created] = await db.insert(users).values(input).returning({ id: users.id });
    if (created) return created.id;
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    // Fall through: a concurrent caller inserted it between our read and write.
  }

  const settled = await idByEmail(db, input.email);
  if (!settled) {
    // A unique violation on `handle` with a different email would land here —
    // two distinct accounts cannot share a handle, and that is a real conflict
    // rather than a race to report honestly.
    throw new Error(
      `could not find or create user ${input.email}; handle \`${input.handle}\` may be taken`,
    );
  }
  return settled;
}
