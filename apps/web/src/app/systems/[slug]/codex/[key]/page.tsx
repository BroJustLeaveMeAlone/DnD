import { getCodexEntry, getDatabase, getOwnedSystem, listCodexEntries } from '@ttrpg/db';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { CodexBody } from '@/components/codex-body';
import { auth } from '@/server/auth';
import { deleteCodexEntryAction } from '@/server/codex';

export const dynamic = 'force-dynamic';

export default async function CodexEntryPage({
  params,
}: {
  params: Promise<{ slug: string; key: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/');

  const { slug, key } = await params;
  const db = getDatabase();

  const system = await getOwnedSystem(db, slug, session.user.id);
  if (!system) notFound();

  const [entry, all] = await Promise.all([
    getCodexEntry(db, slug, key),
    listCodexEntries(db, slug),
  ]);
  if (!entry) notFound();

  const existingKeys = new Set(all.map((e) => e.key));

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <nav className="mb-6 text-sm">
        <Link
          href={`/systems/${slug}/codex`}
          className="text-neutral-500 underline-offset-4 hover:underline"
        >
          ← Codex
        </Link>
      </nav>

      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-neutral-200 pb-6 dark:border-neutral-800">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-neutral-500">
            {entry.type}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">{entry.title}</h1>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/systems/${slug}/codex/new?key=${encodeURIComponent(entry.key)}`}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            Edit
          </Link>
          <form action={deleteCodexEntryAction}>
            <input type="hidden" name="systemSlug" value={slug} />
            <input type="hidden" name="key" value={entry.key} />
            <button
              type="submit"
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800"
            >
              Delete
            </button>
          </form>
        </div>
      </header>

      {entry.boundEntity && (
        <section className="mt-6 rounded-md border border-neutral-200 p-3 text-sm dark:border-neutral-800">
          <p className="text-xs text-neutral-500">Mechanics</p>
          <Link
            href={`/compendium/${slug}/${entry.boundEntity.key}`}
            className="mt-1 inline-block underline underline-offset-4 hover:no-underline"
          >
            {entry.boundEntity.name}
          </Link>
          <span className="ml-2 text-xs text-neutral-500">{entry.boundEntity.type}</span>
        </section>
      )}

      {entry.entityKey && !entry.boundEntity && (
        <p className="mt-6 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs dark:border-amber-800 dark:bg-amber-950">
          Bound to <span className="font-mono">{entry.entityKey}</span>, which no longer exists in
          this system.
        </p>
      )}

      <section className="mt-8">
        <CodexBody body={entry.body} slug={slug} existingKeys={existingKeys} />
      </section>

      {entry.backlinks.length > 0 && (
        <section className="mt-10 border-t border-neutral-200 pt-6 dark:border-neutral-800">
          <h2 className="mb-3 text-sm font-medium">Referenced by</h2>
          <ul className="flex flex-wrap gap-2">
            {entry.backlinks.map((link) => (
              <li key={link.key}>
                <Link
                  href={`/systems/${slug}/codex/${link.key}`}
                  className="inline-block rounded-full border border-neutral-300 px-3 py-1 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
                >
                  {link.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
