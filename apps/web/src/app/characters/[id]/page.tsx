import { getCharacter, getDatabase, loadSystemModule } from '@ttrpg/db';
import { compile, resolve } from '@ttrpg/rules-engine';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { StatValue, signed } from '@/components/stat-value';
import { auth } from '@/server/auth';
import { deleteCharacterAction, updateBuildAction } from '@/server/characters';

export const dynamic = 'force-dynamic';

const ABILITIES = [
  ['str', 'STR'],
  ['dex', 'DEX'],
  ['con', 'CON'],
  ['int', 'INT'],
  ['wis', 'WIS'],
  ['cha', 'CHA'],
] as const;

const PROFICIENCY_SCALE = { none: 0, half: 0.5, proficient: 1, expertise: 2 } as const;

export default async function CharacterSheet({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect('/');

  const { id } = await params;
  const db = getDatabase();
  const character = await getCharacter(db, id);
  if (!character) notFound();
  if (character.ownerId !== session.user.id) notFound();

  const module = await loadSystemModule(db, character.systemSlug);
  if (!module) notFound();

  // Two passes: the first discovers `state` grants (armour category, shield)
  // that conditional effects read. See PROGRESS.md — a single-pass design would
  // be cleaner, but this keeps state derivation as data rather than a special
  // case in the compiler.
  const input = compile(module, character.build);
  const discovered = resolve({ ...input, proficiencyScale: PROFICIENCY_SCALE });
  const stateFlags = discovered.grants.filter((g) => g.category === 'state').map((g) => g.target);
  const sheet = resolve({
    ...input,
    flags: [
      ...(input.flags ?? []),
      ...stateFlags,
      ...(stateFlags.some((s) => s.startsWith('armour.')) ? ['armour.any'] : []),
    ],
    proficiencyScale: PROFICIENCY_SCALE,
  });

  const classes = character.build.classes ?? [];
  const level = classes.reduce((sum, c) => sum + c.level, 0);
  const inventory = character.build.inventory ?? [];
  const itemName = (key: string) => module.entities.find((e) => e.key === key)?.name ?? key;

  const skills = Object.entries(sheet.stats)
    .filter(([key]) => key.startsWith('skill.'))
    .sort(([a], [b]) => a.localeCompare(b));

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
            {classes
              .map((c) => module.entities.find((e) => e.key === c.key)?.name ?? c.key)
              .join(' / ')}
            {' · '}
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

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-medium">Abilities</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {ABILITIES.map(([key, label]) => (
            <StatValue
              key={key}
              label={label}
              derived={sheet.stats[`attr.${key}.mod`]}
              format={signed}
            />
          ))}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-medium">Core</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <StatValue label="Armor Class" derived={sheet.stats.ac} />
          <StatValue label="Hit Points" derived={sheet.stats['hp.max']} />
          <StatValue label="Initiative" derived={sheet.stats.initiative} format={signed} />
          <StatValue label="Speed" derived={sheet.stats.speed} format={(v) => `${v} ft`} />
          <StatValue label="Proficiency" derived={sheet.stats.proficiency_bonus} format={signed} />
          <StatValue label="Attacks" derived={sheet.stats.attacks} />
          <StatValue
            label="Crit range"
            derived={sheet.stats['crit.range']}
            format={(v) => `${v}+`}
          />
          <StatValue label="Passive Perception" derived={sheet.stats['passive.perception']} />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-medium">Saving throws</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {ABILITIES.map(([key, label]) => (
            <StatValue
              key={key}
              label={label}
              derived={sheet.stats[`save.${key}`]}
              format={signed}
            />
          ))}
        </div>
      </section>

      {Object.keys(sheet.resources).length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-medium">Resources</h2>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Object.entries(sheet.resources).map(([key, resource]) => (
              <li
                key={key}
                className="rounded-md border border-neutral-200 p-3 dark:border-neutral-800"
              >
                <p className="text-xs text-neutral-500">{key.replace(/[-_.]/g, ' ')}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{resource.max}</p>
                <p className="text-[10px] text-neutral-400">per {resource.recharge}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-medium">Skills</h2>
        <ul className="grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
          {skills.map(([key, value]) => {
            const name = key.slice('skill.'.length);
            const proficiency = sheet.proficiencies[key]?.level;
            return (
              <li
                key={key}
                className="flex items-baseline justify-between border-b border-neutral-100 py-1 dark:border-neutral-900"
              >
                <span className="capitalize">
                  {name.replace(/_/g, ' ')}
                  {proficiency && proficiency !== 'none' && (
                    <span className="ml-2 text-[10px] uppercase text-neutral-500">
                      {proficiency}
                    </span>
                  )}
                </span>
                <span className="font-mono tabular-nums">{signed(value.value)}</span>
              </li>
            );
          })}
        </ul>
      </section>

      {inventory.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-medium">Inventory</h2>
          <ul className="space-y-2 text-sm">
            {inventory.map((item) => (
              <li
                key={item.key}
                className="flex items-center justify-between rounded-md border border-neutral-200 px-3 py-2 dark:border-neutral-800"
              >
                <span>{itemName(item.key)}</span>
                <span className="flex gap-2">
                  {item.equipped !== undefined && (
                    <form action={updateBuildAction}>
                      <input type="hidden" name="id" value={character.id} />
                      <input type="hidden" name="build" value={toggled(item.key, 'equipped')} />
                      <button
                        type="submit"
                        className={`rounded border px-2 py-1 text-xs ${
                          item.equipped
                            ? 'border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900'
                            : 'border-neutral-300 text-neutral-500 dark:border-neutral-700'
                        }`}
                      >
                        {item.equipped ? 'Equipped' : 'Equip'}
                      </button>
                    </form>
                  )}
                  {item.attuned !== undefined && (
                    <form action={updateBuildAction}>
                      <input type="hidden" name="id" value={character.id} />
                      <input type="hidden" name="build" value={toggled(item.key, 'attuned')} />
                      <button
                        type="submit"
                        className={`rounded border px-2 py-1 text-xs ${
                          item.attuned
                            ? 'border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900'
                            : 'border-neutral-300 text-neutral-500 dark:border-neutral-700'
                        }`}
                      >
                        {item.attuned ? 'Attuned' : 'Attune'}
                      </button>
                    </form>
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
