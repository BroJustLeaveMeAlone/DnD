import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth, configuredProviders } from '@/server/auth';
import { signInWithProvider } from '@/server/auth-actions';
import { devSignIn } from '@/server/dev-auth';

export const dynamic = 'force-dynamic';

/**
 * Auth.js error codes, translated into something a person can act on.
 *
 * The default Auth.js error page says "Try signing in with a different
 * account", which is unhelpful when the real problem is a callback URL typo in
 * a provider console. These messages name the likely cause.
 */
const ERRORS: Record<string, string> = {
  Configuration:
    'This sign-in provider is not configured correctly. If you are running this yourself, check that the client ID and secret are set and that AUTH_SECRET exists.',
  AccessDenied: 'That account was refused. You may have cancelled, or the provider declined.',
  Verification: 'That sign-in link has expired or was already used.',
  OAuthSignin: 'Could not start sign-in with that provider.',
  OAuthCallback:
    'The provider redirected back with an error. The most common cause is a callback URL that does not exactly match the one registered with the provider.',
  OAuthAccountNotLinked:
    'An account already exists with that email address, created through a different provider. Sign in the original way instead.',
  Callback: 'Something went wrong finishing sign-in.',
  Default: 'Sign-in failed.',
};

const button =
  'block w-full rounded-md bg-neutral-900 px-4 py-2.5 text-center text-sm font-medium text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300';

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}) {
  const session = await auth();
  if (session?.user) redirect('/characters');

  const { error, callbackUrl } = await searchParams;
  const providers = configuredProviders();
  const isDevelopment = process.env.NODE_ENV !== 'production';

  // Only allow relative callbacks, so a crafted link cannot bounce someone to
  // another origin carrying a freshly minted session.
  const safeCallback =
    callbackUrl && callbackUrl.startsWith('/') && !callbackUrl.startsWith('//')
      ? callbackUrl
      : '/characters';

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-8 px-6 py-16">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          To build characters, run a table, or publish a world.
        </p>
      </header>

      {error && (
        <p
          role="alert"
          className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
        >
          {ERRORS[error] ?? ERRORS.Default}
        </p>
      )}

      {providers.length > 0 ? (
        <div className="space-y-3">
          {providers.map((provider) => (
            <form key={provider.id} action={signInWithProvider}>
              <input type="hidden" name="provider" value={provider.id} />
              <input type="hidden" name="callbackUrl" value={safeCallback} />
              <button type="submit" className={button}>
                Continue with {provider.name}
              </button>
            </form>
          ))}
        </div>
      ) : (
        <div className="rounded-md border border-neutral-200 p-4 text-sm dark:border-neutral-800">
          <p className="font-medium">No sign-in providers are configured.</p>
          <p className="mt-2 text-neutral-600 dark:text-neutral-400">
            This deployment has no OAuth credentials set. Register an app with Discord or Google,
            then set the matching variables in <code className="font-mono text-xs">.env</code>. See{' '}
            <code className="font-mono text-xs">CREDENTIALS.example.md</code> for the exact keys and
            callback URLs.
          </p>
        </div>
      )}

      {isDevelopment && (
        <div className="border-t border-neutral-200 pt-6 dark:border-neutral-800">
          <form action={devSignIn}>
            <button
              type="submit"
              className="block w-full rounded-md border border-dashed border-neutral-400 px-4 py-2.5 text-center text-sm hover:bg-neutral-100 dark:border-neutral-600 dark:hover:bg-neutral-800"
            >
              Sign in as the development user
            </button>
          </form>
          <p className="mt-2 text-xs text-neutral-500">
            Development only — there is no password, and this button is refused in production.
          </p>
        </div>
      )}

      <Link href="/" className="text-center text-xs text-neutral-500 underline underline-offset-4">
        Back
      </Link>
    </main>
  );
}
