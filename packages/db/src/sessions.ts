import { randomBytes, randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Database } from './client.js';
import { sessions, users } from './schema/index.js';

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

export async function findOrCreateUser(
  db: Database,
  input: { email: string; name: string; handle: string },
): Promise<string> {
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, input.email))
    .limit(1);

  if (existing[0]) return existing[0].id;

  const [created] = await db.insert(users).values(input).returning({ id: users.id });
  if (!created) throw new Error(`failed to create user ${input.email}`);
  return created.id;
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
