import { danglingLinks, getDatabase, getOwnedSystem, listCodexEntries } from '@ttrpg/db';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/server/auth';

export const dynamic = 'force-dynamic';

export default async function CodexPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/');

  const { slug } = await params;
  const { error } = await searchParams;
  const db = getDatabase();

  const system = await getOwnedSystem(db, slug, session.user.id);
  if (!system) notFound();

  const [entries, dangling] = await Promise.all([
    listCodexEntries(db, slug),
    danglingLinks(db, slug),
  ]);

  const byType = new Map<string, typeof entries>();
  for (const entry of entries) {
    const group = byType.get(entry.type);
    if (group) group.push(entry);
    else byType.set(entry.type, [entry]);
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <nav className="mb-6 text-sm">
        <Link
          href={`/systems/${slug}`}
          className="text-neutral-500 underline-offset-4 hover:underline"
        >
          ← {system.name}
        </Link>
      </nav>

      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Codex</h1>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            Characters, places, factions and events — linked to each other with{' '}
            <code className="font-mono text-xs">[[double-brackets]]</code>, and to real mechanics.
          </p>
        </div>
        <Link
          href={`/systems/${slug}/codex/new`}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
        >
          New entry
        </Link>
      </header>

      {error && (
        <p
          role="alert"
          className="mb-6 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
        >
          Could not save: {error}
        </p>
      )}

      {entries.length === 0 ? (
        <p className="rounded-md border border-dashed border-neutral-300 p-10 text-center text-sm text-neutral-500 dark:border-neutral-700">
          Nothing written yet.
        </p>
      ) : (
        [...byType.entries()].map(([type, group]) => (
          <section key={type} className="mb-8">
            <h2 className="mb-2 text-xs font-medium uppercase tracking-widest text-neutral-500">
              {type}
            </h2>
            <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {group.map((entry) => (
                <li key={entry.key} className="flex items-center justify-between gap-4 py-2">
                  <Link
                    href={`/systems/${slug}/codex/${entry.key}`}
                    className="flex-1 text-sm underline-offset-4 hover:underline"
                  >
                    {entry.title}
                  </Link>
                  {entry.entityKey && (
                    <span className="rounded-full border border-neutral-300 px-2 py-0.5 text-[10px] dark:border-neutral-700">
                      bound to {entry.entityKey}
                    </span>
                  )}
                  <span className="text-xs text-neutral-400">{entry.visibility}</span>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      {dangling.length > 0 && (
        <section className="mt-10 rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
          <h2 className="text-sm font-medium">Unwritten</h2>
          <p className="mb-3 mt-1 text-xs text-neutral-500">
            Links pointing at entries that do not exist yet. Not a problem — this is what your world
            still owes you.
          </p>
          <ul className="flex flex-wrap gap-2">
            {dangling.map((link, i) => (
              <li key={i}>
                <Link
                  href={`/systems/${slug}/codex/new?key=${encodeURIComponent(link.to)}`}
                  className="inline-block rounded-full border border-dashed border-neutral-400 px-3 py-1 font-mono text-xs hover:bg-neutral-100 dark:border-neutral-600 dark:hover:bg-neutral-800"
                >
                  {link.to}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
