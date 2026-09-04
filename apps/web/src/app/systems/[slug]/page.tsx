import { getDatabase, listOwnedSystems, searchCompendium } from '@ttrpg/db';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/server/auth';
import { deleteEntityAction } from '@/server/authoring';

export const dynamic = 'force-dynamic';

export default async function SystemPage({
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

  const owned = await listOwnedSystems(db, session.user.id);
  const system = owned.find((s) => s.slug === slug);
  if (!system) notFound();

  const { entries } = await searchCompendium(db, { systemSlug: slug, limit: 200 });
  const byType = new Map<string, typeof entries>();
  for (const entry of entries) {
    const group = byType.get(entry.type);
    if (group) group.push(entry);
    else byType.set(entry.type, [entry]);
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <nav className="mb-6 text-sm">
        <Link href="/systems" className="text-neutral-500 underline-offset-4 hover:underline">
          ← Systems
        </Link>
      </nav>

      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{system.name}</h1>
          <p className="mt-1 font-mono text-xs text-neutral-500">{system.slug}</p>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/systems/${slug}/lint`}
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            Check
          </Link>
          <Link
            href={`/systems/${slug}/design`}
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            Design
          </Link>
          <Link
            href={`/systems/${slug}/new`}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
          >
            New content
          </Link>
        </div>
      </header>

      {error && (
        <p
          role="alert"
          className="mb-6 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
        >
          Could not save: {error}
        </p>
      )}

      <p className="mb-6 text-sm text-neutral-600 dark:text-neutral-400">
        {entries.length} entities. Editing one bumps its version, so characters that pinned the old
        version keep working until they opt in.
      </p>

      {[...byType.entries()].map(([type, group]) => (
        <section key={type} className="mb-8">
          <h2 className="mb-2 text-xs font-medium uppercase tracking-widest text-neutral-500">
            {type}
          </h2>
          <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {group.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between gap-4 py-2">
                <Link
                  href={`/systems/${slug}/${entry.key}`}
                  className="flex-1 text-sm underline-offset-4 hover:underline"
                >
                  {entry.name}
                </Link>
                <span className="font-mono text-xs text-neutral-400">{entry.key}</span>
                <form action={deleteEntityAction}>
                  <input type="hidden" name="systemSlug" value={slug} />
                  <input type="hidden" name="key" value={entry.key} />
                  <button
                    type="submit"
                    className="text-xs text-neutral-500 underline underline-offset-4 hover:text-red-600"
                  >
                    Delete
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
