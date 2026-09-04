import { getCharacter, getDatabase, loadSystemModule } from '@ttrpg/db';
import { compile, resolve } from '@ttrpg/rules-engine';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AutoSheet } from '@/components/auto-sheet';
import { auth } from '@/server/auth';
import { deleteCharacterAction, updateBuildAction } from '@/server/characters';

export const dynamic = 'force-dynamic';

const DEFAULT_PROFICIENCY_SCALE = { none: 0, half: 0.5, proficient: 1, expertise: 2 } as const;

export default async function CharacterSheetPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect('/');

  const { id } = await params;
  const db = getDatabase();
  const character = await getCharacter(db, id);
  if (!character) notFound();
  if (character.ownerId !== session.user.id) notFound();

  const module = await loadSystemModule(db, character.systemSlug);
  if (!module) notFound();

  const scale = module.proficiencyScale ?? DEFAULT_PROFICIENCY_SCALE;

  // Two passes: the first discovers `state` grants (armour category, shield)
  // that conditional effects read. See PROGRESS.md — a single-pass design would
  // be cleaner, but this keeps state derivation as data rather than a special
  // case in the compiler.
  const input = compile(module, character.build);
  const discovered = resolve({ ...input, proficiencyScale: scale });
  const stateFlags = discovered.grants.filter((g) => g.category === 'state').map((g) => g.target);
  const sheet = resolve({
    ...input,
    flags: [
      ...(input.flags ?? []),
      ...stateFlags,
      ...(stateFlags.some((s) => s.startsWith('armour.')) ? ['armour.any'] : []),
    ],
    proficiencyScale: scale,
  });

  const classes = character.build.classes ?? [];
  const level = classes.reduce((sum, c) => sum + c.level, 0);
  const inventory = character.build.inventory ?? [];
  const nameOf = (key: string) => module.entities.find((e) => e.key === key)?.name ?? key;

  const toggled = (key: string, field: 'equipped' | 'attuned') =>
    JSON.stringify({
      ...character.build,
      inventory: inventory.map((item) =>
        item.key === key ? { ...item, [field]: !item[field] } : item,
      ),
    });

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <nav className="mb-6 text-sm">
        <Link href="/characters" className="text-neutral-500 underline-offset-4 hover:underline">
          ← Characters
        </Link>
      </nav>

      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-neutral-200 pb-6 dark:border-neutral-800">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{character.name}</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {level > 0 ? `Level ${level} ` : ''}
            {classes.map((c) => nameOf(c.key)).join(' / ')}
            {classes.length > 0 ? ' · ' : ''}
            {character.systemName}
          </p>
        </div>
        <form action={deleteCharacterAction}>
          <input type="hidden" name="id" value={character.id} />
          <button
            type="submit"
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800"
          >
            Delete
          </button>
        </form>
      </header>

      {sheet.diagnostics.length > 0 && (
        <section className="mt-6 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-800 dark:bg-amber-950">
          <h2 className="font-medium">Warnings</h2>
          <ul className="mt-2 space-y-1 text-xs">
            {sheet.diagnostics.map((d, i) => (
              <li key={i}>
                <span className="font-mono">{d.code}</span> — {d.message}
              </li>
            ))}
          </ul>
        </section>
      )}

      <AutoSheet module={module} sheet={sheet} />

      {inventory.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-medium">Inventory</h2>
          <ul className="space-y-2 text-sm">
            {inventory.map((item) => (
              <li
                key={item.key}
                className="flex items-center justify-between rounded-md border border-neutral-200 px-3 py-2 dark:border-neutral-800"
              >
                <span>{nameOf(item.key)}</span>
                <span className="flex gap-2">
                  {(['equipped', 'attuned'] as const).map((field) =>
                    item[field] !== undefined ? (
                      <form action={updateBuildAction} key={field}>
                        <input type="hidden" name="id" value={character.id} />
                        <input type="hidden" name="build" value={toggled(item.key, field)} />
                        <button
                          type="submit"
                          className={`rounded border px-2 py-1 text-xs capitalize ${
                            item[field]
                              ? 'border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900'
                              : 'border-neutral-300 text-neutral-500 dark:border-neutral-700'
                          }`}
                        >
                          {item[field] ? field : field.replace(/(p?ed)$/, '')}
                        </button>
                      </form>
                    ) : null,
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
