import { type SQL, and, asc, count, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import type { Database } from './client.js';
import { entities, systems } from './schema/index.js';

/**
 * Compendium reads.
 *
 * Everything is filtered by system, because two rulesets sitting side by side
 * is the normal case here — an unscoped query would silently mix 2014 and 2024
 * content, which is worse than returning nothing.
 */

export interface CompendiumFilters {
  systemSlug?: string;
  types?: string[];
  /** Matches name; falls back to key so `sleight_of_hand` finds the skill. */
  search?: string;
  /** Source ids such as `srd-5-1`. */
  sources?: string[];
  limit?: number;
  offset?: number;
}

export interface CompendiumEntry {
  id: string;
  key: string;
  name: string;
  type: string;
  systemSlug: string;
  systemName: string;
  source: { id: string; name: string; license: string | null };
  data: Record<string, unknown>;
}

function buildConditions(filters: CompendiumFilters): SQL[] {
  const conditions: SQL[] = [
    // Character-scoped content belongs to one person and never appears in a
    // shared compendium listing.
    eq(entities.scope, 'system'),
  ];

  if (filters.systemSlug) conditions.push(eq(systems.slug, filters.systemSlug));
  if (filters.types?.length) conditions.push(inArray(entities.type, filters.types));
  if (filters.sources?.length) {
    conditions.push(
      inArray(sql`${entities.source} ->> 'id'`, filters.sources as unknown as string[]),
    );
  }

  const term = filters.search?.trim();
  if (term) {
    const pattern = `%${term.replace(/[%_]/g, (c) => `\\${c}`)}%`;
    const match = or(ilike(entities.name, pattern), ilike(entities.key, pattern));
    if (match) conditions.push(match);
  }

  return conditions;
}

export async function searchCompendium(
  db: Database,
  filters: CompendiumFilters = {},
): Promise<{ entries: CompendiumEntry[]; total: number }> {
  const conditions = buildConditions(filters);
  const limit = Math.min(filters.limit ?? 50, 200);

  const rows = await db
    .select({
      id: entities.id,
      key: entities.key,
      name: entities.name,
      type: entities.type,
      source: entities.source,
      body: entities.body,
      systemSlug: systems.slug,
      systemName: systems.name,
    })
    .from(entities)
    .innerJoin(systems, eq(entities.systemId, systems.id))
    .where(and(...conditions))
    .orderBy(asc(entities.type), asc(entities.name))
    .limit(limit)
    .offset(filters.offset ?? 0);

  const [totals] = await db
    .select({ value: count() })
    .from(entities)
    .innerJoin(systems, eq(entities.systemId, systems.id))
    .where(and(...conditions));

  return {
    total: totals?.value ?? 0,
    entries: rows.map((row) => ({
      id: row.id,
      key: row.key,
      name: row.name,
      type: row.type,
      systemSlug: row.systemSlug,
      systemName: row.systemName,
      source: row.source as CompendiumEntry['source'],
      data: ((row.body as { data?: Record<string, unknown> })?.data ?? {}) as Record<
        string,
        unknown
      >,
    })),
  };
}

export async function getEntity(
  db: Database,
  systemSlug: string,
  key: string,
): Promise<(CompendiumEntry & { grants: unknown[] }) | undefined> {
  const [row] = await db
    .select({
      id: entities.id,
      key: entities.key,
      name: entities.name,
      type: entities.type,
      source: entities.source,
      body: entities.body,
      grants: entities.grants,
      systemSlug: systems.slug,
      systemName: systems.name,
    })
    .from(entities)
    .innerJoin(systems, eq(entities.systemId, systems.id))
    .where(and(eq(systems.slug, systemSlug), eq(entities.key, key), eq(entities.scope, 'system')))
    .limit(1);

  if (!row) return undefined;

  return {
    id: row.id,
    key: row.key,
    name: row.name,
    type: row.type,
    systemSlug: row.systemSlug,
    systemName: row.systemName,
    source: row.source as CompendiumEntry['source'],
    data: ((row.body as { data?: Record<string, unknown> })?.data ?? {}) as Record<string, unknown>,
    grants: (row.grants as unknown[]) ?? [],
  };
}

/** Type facets with counts, for the browse sidebar. */
export async function compendiumFacets(
  db: Database,
  filters: CompendiumFilters = {},
): Promise<{ type: string; count: number }[]> {
  // Type is the facet being counted, so exclude it from its own filter.
  const { types: _ignored, ...rest } = filters;

  return db
    .select({ type: entities.type, count: count() })
    .from(entities)
    .innerJoin(systems, eq(entities.systemId, systems.id))
    .where(and(...buildConditions(rest)))
    .groupBy(entities.type)
    .orderBy(asc(entities.type));
}

export async function listSystems(db: Database) {
  return db
    .select({ slug: systems.slug, name: systems.name, summary: systems.summary })
    .from(systems)
    .where(eq(systems.visibility, 'public'))
    .orderBy(asc(systems.name));
}

/**
 * Structured query over mechanics — the thing D&D Beyond structurally cannot
 * do, because their content is licensed prose and ours is data. Finds every
 * entity whose grants contain an effect matching a target and/or kind:
 * "everything that touches AC", "every source of advantage".
 */
export async function findByEffect(
  db: Database,
  options: { systemSlug?: string; target?: string; kind?: string },
): Promise<CompendiumEntry[]> {
  const conditions: SQL[] = [eq(entities.scope, 'system')];
  if (options.systemSlug) conditions.push(eq(systems.slug, options.systemSlug));

  const effectShape: Record<string, string> = {};
  if (options.target) effectShape.target = options.target;
  if (options.kind) effectShape.kind = options.kind;

  // Nested jsonb containment rather than lateral `jsonb_array_elements`.
  // Both are correct, but only containment can use the GIN index on `grants` —
  // an unwinding join forces a sequential scan over every entity, which is fine
  // for a seeded slice and not fine for a full compendium.
  conditions.push(
    sql`${entities.grants} @> ${JSON.stringify([{ effects: [effectShape] }])}::jsonb`,
  );

  const rows = await db
    .select({
      id: entities.id,
      key: entities.key,
      name: entities.name,
      type: entities.type,
      source: entities.source,
      body: entities.body,
      systemSlug: systems.slug,
      systemName: systems.name,
    })
    .from(entities)
    .innerJoin(systems, eq(entities.systemId, systems.id))
    .where(and(...conditions))
    .orderBy(asc(entities.name));

  return rows.map((row) => ({
    id: row.id,
    key: row.key,
    name: row.name,
    type: row.type,
    systemSlug: row.systemSlug,
    systemName: row.systemName,
    source: row.source as CompendiumEntry['source'],
    data: ((row.body as { data?: Record<string, unknown> })?.data ?? {}) as Record<string, unknown>,
  }));
}
