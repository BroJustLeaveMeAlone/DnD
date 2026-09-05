'use server';

import { signIn, signOut } from './auth';

/**
 * OAuth sign-in and sign-out.
 *
 * Separate from auth.ts because a `'use server'` module may only export async
 * functions, and auth.ts exports config helpers and types.
 *
 * Note that these are distinct from the development sign-in in dev-auth.ts,
 * which writes a session row directly. This path goes through the provider
 * redirect and is the one that will run in production.
 */

export async function signInWithProvider(form: FormData): Promise<void> {
  const provider = String(form.get('provider') ?? '');
  const callbackUrl = String(form.get('callbackUrl') ?? '/characters');

  // signIn throws a redirect internally; that is how Auth.js hands control to
  // the provider, so it must not be caught here.
  await signIn(provider, { redirectTo: callbackUrl });
}

export async function signOutEverywhere(): Promise<void> {
  // Deletes the session row through the adapter as well as clearing the
  // cookie, so a stolen cookie stops working rather than merely disappearing
  // from this browser.
  await signOut({ redirectTo: '/' });
}
