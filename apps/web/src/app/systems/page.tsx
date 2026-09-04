import { getDatabase, listOwnedSystems, listSystems } from '@ttrpg/db';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/server/auth';
import { forkSystemAction } from '@/server/authoring';

export const dynamic = 'force-dynamic';

const field =
  'w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:border-neutral-700 dark:bg-neutral-900';

export default async function SystemsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/');

  const db = getDatabase();
  const [owned, published] = await Promise.all([
    listOwnedSystems(db, session.user.id),
    listSystems(db),
  ]);
  const { error } = await searchParams;

  const forkable = published.filter((p) => !owned.some((o) => o.slug === p.slug));

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Systems</h1>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
          Fork a ruleset to make it yours, then change anything in it. A fork is a snapshot — the
          original can never move under you.
        </p>
      </header>

      {error && (
        <p
          role="alert"
          className="mb-6 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
        >
          {error === 'slug-taken'
            ? 'That identifier is already in use. Pick another.'
            : `Could not save: ${error}`}
        </p>
      )}

      <section>
        <h2 className="mb-3 text-sm font-medium">Your systems</h2>
        {owned.length === 0 ? (
          <p className="rounded-md border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500 dark:border-neutral-700">
            None yet. Fork one below.
          </p>
        ) : (
          <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {owned.map((system) => (
              <li key={system.slug}>
                <Link
                  href={`/systems/${system.slug}`}
                  className="-mx-2 block rounded px-2 py-3 hover:bg-neutral-50 dark:hover:bg-neutral-900"
                >
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="font-medium">{system.name}</span>
                    <span className="text-xs text-neutral-500">{system.visibility}</span>
                  </div>
                  <p className="mt-0.5 font-mono text-xs text-neutral-500">{system.slug}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {forkable.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-sm font-medium">Fork a ruleset</h2>
          <form
            action={forkSystemAction}
            className="grid gap-3 rounded-md border border-neutral-200 p-4 sm:grid-cols-3 dark:border-neutral-800"
          >
            <label className="block text-sm sm:col-span-3">
              <span className="mb-1 block text-xs text-neutral-500">Start from</span>
              <select name="sourceSlug" className={field}>
                {forkable.map((system) => (
                  <option key={system.slug} value={system.slug}>
                    {system.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block text-xs text-neutral-500">Name</span>
              <input name="name" required maxLength={200} className={field} />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-neutral-500">Identifier</span>
              <input
                name="slug"
                required
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                title="lowercase kebab-case"
                placeholder="my-world"
                className={`${field} font-mono`}
              />
            </label>
            <button
              type="submit"
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 sm:col-span-3 sm:justify-self-start dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
            >
              Fork
            </button>
          </form>
        </section>
      )}
    </main>
  );
}
