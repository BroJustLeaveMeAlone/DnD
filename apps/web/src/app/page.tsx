import { ENGINE_VERSION } from '@ttrpg/rules-engine';
import { auth } from '@/server/auth';

export default async function Home() {
  const session = await auth();

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-8 px-6 py-16">
      <header className="space-y-3">
        <p className="text-xs font-medium uppercase tracking-widest text-neutral-500">Phase 0</p>
        <h1 className="text-3xl font-semibold tracking-tight">TTRPG Platform</h1>
        <p className="text-neutral-600 dark:text-neutral-400">
          Foundations are in place. The rules engine lands in Phase 1.
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
