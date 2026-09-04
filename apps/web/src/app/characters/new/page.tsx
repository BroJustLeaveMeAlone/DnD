import { getDatabase, listSystems, loadSystemModule } from '@ttrpg/db';
import { redirect } from 'next/navigation';
import { auth } from '@/server/auth';
import { createCharacterAction } from '@/server/characters';

export const dynamic = 'force-dynamic';

const ABILITIES = [
  ['str', 'Strength'],
  ['dex', 'Dexterity'],
  ['con', 'Constitution'],
  ['int', 'Intelligence'],
  ['wis', 'Wisdom'],
  ['cha', 'Charisma'],
] as const;

const field =
  'w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:border-neutral-700 dark:bg-neutral-900';

export default async function NewCharacterPage({
  searchParams,
}: {
  searchParams: Promise<{ system?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/');

  const db = getDatabase();
  const systems = await listSystems(db);
  const params = await searchParams;
  const selected = params.system ?? systems[0]?.slug;

  // Options come from the chosen ruleset, so a 2024 character can never be
  // offered a 2014-only species. Changing the ruleset reloads this page.
  const module = selected ? await loadSystemModule(db, selected) : undefined;
  const byType = (type: string) => (module?.entities ?? []).filter((e) => e.type === type);

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">New character</h1>

      <form method="get" className="mt-6">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Ruleset</span>
          <select name="system" defaultValue={selected} className={field}>
            {systems.map((system) => (
              <option key={system.slug} value={system.slug}>
                {system.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="mt-2 text-xs text-neutral-500 underline underline-offset-4"
        >
          Change ruleset
        </button>
      </form>

      <form action={createCharacterAction} className="mt-8 space-y-6">
        <input type="hidden" name="system" value={selected ?? ''} />

        <label className="block text-sm">
          <span className="mb-1 block font-medium">Name</span>
          <input name="name" required maxLength={100} className={field} />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Species</span>
            <select name="species" className={field}>
              <option value="">None</option>
              {byType('species').map((e) => (
                <option key={e.key} value={e.key}>
                  {e.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium">Background</span>
            <select name="background" className={field}>
              <option value="">None</option>
              {byType('background').map((e) => (
                <option key={e.key} value={e.key}>
                  {e.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium">Class</span>
            <select name="class" className={field}>
              {byType('class').map((e) => (
                <option key={e.key} value={e.key}>
                  {e.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium">Subclass</span>
            <select name="subclass" className={field}>
              <option value="">None</option>
              {byType('subclass').map((e) => (
                <option key={e.key} value={e.key}>
                  {e.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium">Level</span>
            <input type="number" name="level" min={1} max={20} defaultValue={1} className={field} />
          </label>
        </div>

        <fieldset>
          <legend className="mb-2 text-sm font-medium">Ability scores</legend>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {ABILITIES.map(([key, label]) => (
              <label key={key} className="block text-sm">
                <span className="mb-1 block text-xs text-neutral-500">{label}</span>
                <input
                  type="number"
                  name={`attr.${key}`}
                  min={1}
                  max={30}
                  defaultValue={10}
                  className={field}
                />
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-neutral-500">
            Raw scores before species or background increases. The sheet applies those and shows you
            where each point came from.
          </p>
        </fieldset>

        <button
          type="submit"
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
        >
          Create character
        </button>
      </form>
    </main>
  );
}
