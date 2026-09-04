import { getCodexEntry, getDatabase, getOwnedSystem, searchCompendium } from '@ttrpg/db';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/server/auth';
import { saveCodexEntryAction } from '@/server/codex';

export const dynamic = 'force-dynamic';

const TYPES = [
  'character',
  'location',
  'faction',
  'organization',
  'deity',
  'event',
  'item',
  'species',
  'language',
  'note',
] as const;

const field =
  'w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:border-neutral-700 dark:bg-neutral-900';

/** Doubles as the edit form: passing `?key=` of an existing entry loads it. */
export default async function CodexEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ key?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/');

  const { slug } = await params;
  const { key } = await searchParams;
  const db = getDatabase();

  const system = await getOwnedSystem(db, slug, session.user.id);
  if (!system) notFound();

  const existing = key ? await getCodexEntry(db, slug, key) : undefined;
  const { entries } = await searchCompendium(db, { systemSlug: slug, limit: 200 });

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

      <h1 className="mb-8 text-3xl font-semibold tracking-tight">
        {existing ? existing.title : 'New entry'}
      </h1>

      <form action={saveCodexEntryAction} className="space-y-5">
        <input type="hidden" name="systemSlug" value={slug} />

        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block font-medium">Title</span>
            <input
              name="title"
              defaultValue={existing?.title ?? ''}
              required
              maxLength={200}
              className={field}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Type</span>
            <select name="type" defaultValue={existing?.type ?? 'note'} className={field}>
              {TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Key</span>
            <input
              name="key"
              defaultValue={existing?.key ?? key ?? ''}
              required
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              title="lowercase kebab-case"
              className={`${field} font-mono`}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Visibility</span>
            <select
              name="visibility"
              defaultValue={existing?.visibility ?? 'private'}
              className={field}
            >
              <option value="private">Private</option>
              <option value="shared">Shared with the table</option>
              <option value="public">Public</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Bind to mechanics</span>
            <select name="entityKey" defaultValue={existing?.entityKey ?? ''} className={field}>
              <option value="">None</option>
              {entries.map((entity) => (
                <option key={entity.key} value={entity.key}>
                  {entity.name} ({entity.type})
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="block text-sm">
          <span className="mb-1 block font-medium">Body</span>
          <textarea
            name="body"
            defaultValue={existing?.body ?? ''}
            rows={16}
            className={`${field} font-mono`}
            placeholder="Link to other entries with [[double-brackets]]."
          />
          <span className="mt-1 block text-xs text-neutral-500">
            Write <code className="font-mono">[[some-key]]</code> to link. Linking to something that
            does not exist yet is fine — it shows up as unwritten.
          </span>
        </label>

        <button
          type="submit"
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
        >
          Save
        </button>
      </form>
    </main>
  );
}
