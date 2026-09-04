import { compendiumFacets, getDatabase, listSystems, searchCompendium } from '@ttrpg/db';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

const TYPE_LABELS: Record<string, string> = {
  species: 'Species',
  background: 'Backgrounds',
  class: 'Classes',
  subclass: 'Subclasses',
  feat: 'Feats',
  power: 'Spells & Powers',
  item: 'Items',
  condition: 'Conditions',
  monster: 'Monsters',
};

const label = (type: string) => TYPE_LABELS[type] ?? type.replace(/[-_]/g, ' ');

const asArray = (value: string | string[] | undefined): string[] | undefined =>
  value === undefined ? undefined : Array.isArray(value) ? value : [value];

export default async function CompendiumPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const db = getDatabase();

  const systemSlug = typeof params.system === 'string' ? params.system : undefined;
  const search = typeof params.q === 'string' ? params.q : undefined;
  const types = asArray(params.type);

  const filters = {
    ...(systemSlug !== undefined ? { systemSlug } : {}),
    ...(search !== undefined ? { search } : {}),
    ...(types !== undefined ? { types } : {}),
  };

  const [systems, facets, results] = await Promise.all([
    listSystems(db),
    compendiumFacets(db, filters),
    searchCompendium(db, filters),
  ]);

  const queryWith = (overrides: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    if (systemSlug) next.set('system', systemSlug);
    if (search) next.set('q', search);
    for (const type of types ?? []) next.append('type', type);
    for (const [key, value] of Object.entries(overrides)) {
      next.delete(key);
      if (value !== undefined) next.set(key, value);
    }
    const qs = next.toString();
    return qs ? `/compendium?${qs}` : '/compendium';
  };

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Compendium</h1>
        <p className="mt-2 text-neutral-600 dark:text-neutral-400">
          {results.total} {results.total === 1 ? 'entry' : 'entries'}
          {systemSlug
            ? ` in ${systems.find((s) => s.slug === systemSlug)?.name ?? systemSlug}`
            : ''}
        </p>
      </header>

      <form method="get" action="/compendium" className="mb-8 flex flex-wrap gap-3">
        {types?.map((type) => (
          <input key={type} type="hidden" name="type" value={type} />
        ))}
        <label className="flex-1">
          <span className="sr-only">Search the compendium</span>
          <input
            type="search"
            name="q"
            defaultValue={search ?? ''}
            placeholder="Search by name…"
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>
        <label>
          <span className="sr-only">Ruleset</span>
          <select
            name="system"
            defaultValue={systemSlug ?? ''}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          >
            <option value="">All rulesets</option>
            {systems.map((system) => (
              <option key={system.slug} value={system.slug}>
                {system.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
        >
          Search
        </button>
      </form>

      <div className="grid gap-8 md:grid-cols-[12rem_1fr]">
        <nav aria-label="Filter by type">
          <h2 className="mb-3 text-xs font-medium uppercase tracking-widest text-neutral-500">
            Type
          </h2>
          <ul className="space-y-1 text-sm">
            <li>
              <Link
                href={queryWith({ type: undefined })}
                className={`block rounded px-2 py-1 hover:bg-neutral-100 dark:hover:bg-neutral-800 ${
                  !types?.length ? 'font-medium' : 'text-neutral-600 dark:text-neutral-400'
                }`}
              >
                All types
              </Link>
            </li>
            {facets.map((facet) => (
              <li key={facet.type}>
                <Link
                  href={queryWith({ type: facet.type })}
                  aria-current={types?.includes(facet.type) ? 'page' : undefined}
                  className={`flex justify-between rounded px-2 py-1 hover:bg-neutral-100 dark:hover:bg-neutral-800 ${
                    types?.includes(facet.type)
                      ? 'font-medium'
                      : 'text-neutral-600 dark:text-neutral-400'
                  }`}
                >
                  <span>{label(facet.type)}</span>
                  <span className="tabular-nums text-neutral-400">{facet.count}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <section aria-label="Results">
          {results.entries.length === 0 ? (
            <p className="rounded-md border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500 dark:border-neutral-700">
              Nothing matches those filters.
            </p>
          ) : (
            <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {results.entries.map((entry) => (
                <li key={entry.id}>
                  <Link
                    href={`/compendium/${entry.systemSlug}/${entry.key}`}
                    className="-mx-2 block rounded px-2 py-3 hover:bg-neutral-50 dark:hover:bg-neutral-900"
                  >
                    <div className="flex items-baseline justify-between gap-4">
                      <span className="font-medium">{entry.name}</span>
                      <span className="shrink-0 text-xs text-neutral-500">{label(entry.type)}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-neutral-500">{entry.systemName}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
