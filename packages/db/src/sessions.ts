import { randomBytes, randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Database } from './client.js';
import { sessions } from './schema/index.js';
import { findOrCreateUserRow } from './upsert.js';

/**
 * Direct session management, used by the development sign-in.
 *
 * Lives here rather than in the web app so nothing above this package needs to
 * import drizzle-orm — @ttrpg/db owns the ORM and everything else goes through
 * its API.
 *
 * These functions do NOT enforce that they are only used in development. That
 * guard belongs at the call site, where the environment is known.
 */

const SESSION_DAYS = 30;

/**
 * Idempotent and safe under concurrency — see `findOrCreateUserRow`.
 *
 * An existing user's name is never overwritten: this is find-or-create, and
 * rewriting someone's profile because they signed in again would be a
 * surprising side effect.
 */
export async function findOrCreateUser(
  db: Database,
  input: { email: string; name: string; handle: string },
): Promise<string> {
  return findOrCreateUserRow(db, input);
}

export interface IssuedSession {
  sessionToken: string;
  expires: Date;
}

export async function issueSession(db: Database, userId: string): Promise<IssuedSession> {
  const sessionToken = `${randomUUID()}.${randomBytes(24).toString('hex')}`;
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await db.insert(sessions).values({ sessionToken, userId, expires });
  return { sessionToken, expires };
}

export async function revokeSession(db: Database, sessionToken: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.sessionToken, sessionToken));
}
