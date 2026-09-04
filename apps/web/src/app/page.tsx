import { ENGINE_VERSION } from '@ttrpg/rules-engine';
import Link from 'next/link';
import { auth } from '@/server/auth';

export default async function Home() {
  const session = await auth();

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-8 px-6 py-16">
      <header className="space-y-3">
        <p className="text-xs font-medium uppercase tracking-widest text-neutral-500">Phase 3</p>
        <h1 className="text-3xl font-semibold tracking-tight">TTRPG Platform</h1>
        <p className="text-neutral-600 dark:text-neutral-400">
          Rules engine and both 5e rulesets are in. The character builder lands in Phase 4.
        </p>
        <p>
          <Link
            href="/compendium"
            className="inline-block rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
          >
            Browse the compendium
          </Link>
        </p>
      </header>

      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 border-t border-neutral-200 pt-6 text-sm dark:border-neutral-800">
        <dt className="text-neutral-500">Rules engine</dt>
        <dd className="font-mono">{ENGINE_VERSION}</dd>

        <dt className="text-neutral-500">Session</dt>
        <dd className="font-mono">{session?.user?.email ?? 'signed out'}</dd>

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
