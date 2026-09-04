import { ENGINE_VERSION } from '@ttrpg/rules-engine';
import Link from 'next/link';
import { auth } from '@/server/auth';
import { devSignIn, devSignOut } from '@/server/dev-auth';

const button =
  'inline-block rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300';

export default async function Home() {
  const session = await auth();
  const isDevelopment = process.env.NODE_ENV !== 'production';

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-8 px-6 py-16">
      <header className="space-y-3">
        <p className="text-xs font-medium uppercase tracking-widest text-neutral-500">Phase 4</p>
        <h1 className="text-3xl font-semibold tracking-tight">TTRPG Platform</h1>
        <p className="text-neutral-600 dark:text-neutral-400">
          Build and play tabletop RPGs. 5e is the starter kit, not the ceiling.
        </p>
      </header>

      <div className="flex flex-wrap gap-3">
        <Link href="/compendium" className={button}>
          Browse the compendium
        </Link>
        {session?.user ? (
          <>
            {[
              ['/characters', 'Characters'],
              ['/campaigns', 'Campaigns'],
              ['/systems', 'Systems'],
            ].map(([href, label]) => (
              <Link
                key={href}
                href={href!}
                className="inline-block rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
              >
                {label}
              </Link>
            ))}
          </>
        ) : (
          isDevelopment && (
            <form action={devSignIn}>
              <button type="submit" className={button}>
                Sign in (development)
              </button>
            </form>
          )
        )}
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 border-t border-neutral-200 pt-6 text-sm dark:border-neutral-800">
        <dt className="text-neutral-500">Rules engine</dt>
        <dd className="font-mono">{ENGINE_VERSION}</dd>

        <dt className="text-neutral-500">Session</dt>
        <dd className="flex items-center gap-3 font-mono">
          {session?.user?.email ?? 'signed out'}
          {session?.user && (
            <form action={devSignOut}>
              <button
                type="submit"
                className="font-sans text-xs text-neutral-500 underline underline-offset-4"
              >
                sign out
              </button>
            </form>
          )}
        </dd>

        <dt className="text-neutral-500">Health</dt>
        <dd>
          <a className="underline underline-offset-4 hover:no-underline" href="/api/health">
            /api/health
          </a>
        </dd>
      </dl>
    </main>
  );
}
