'use server';

import { findOrCreateUser, getDatabase, issueSession } from '@ttrpg/db';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

/**
 * Development-only sign-in.
 *
 * No OAuth app is registered yet, so without this there is no way to hold a
 * session and every authenticated page is unreachable. It issues a session row
 * and cookie directly rather than going through a provider, because Auth.js
 * credentials providers require the JWT session strategy and this project uses
 * database sessions.
 *
 * Hard-refuses to run in production. That guard is the only thing standing
 * between this and an authentication bypass, so it is checked at call time
 * rather than at import time: a bundler cannot strip it, and it holds no matter
 * which import path reaches this function.
 */

// Not exported: a 'use server' module may only export async functions.
const DEV_USER = {
  email: 'dev@ttrpg.local',
  name: 'Dev User',
  handle: 'dev',
} as const;

const SESSION_COOKIE = 'authjs.session-token';

function assertNotProduction(): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Development sign-in is disabled in production.');
  }
}

export async function devSignIn(): Promise<void> {
  assertNotProduction();

  const db = getDatabase();
  const userId = await findOrCreateUser(db, { ...DEV_USER });
  const { sessionToken, expires } = await issueSession(db, userId);

  const store = await cookies();
  store.set(SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    expires,
    secure: false,
  });

  redirect('/characters');
}

// Sign-out is deliberately not duplicated here. Auth.js `signOut` deletes the
// session row through the adapter and clears the same cookie, so it works for a
// development session as well as an OAuth one — see server/auth-actions.ts.
