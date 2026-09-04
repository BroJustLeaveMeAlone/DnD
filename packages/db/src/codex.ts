import { and, asc, eq, sql } from 'drizzle-orm';
import type { Database } from './client.js';
import { codexEntries, entities, systems } from './schema/index.js';

/**
 * The Codex: world-building prose that binds to real mechanics.
 *
 * Wiki links are written `[[some-key]]` in the body and extracted on write, so
 * backlinks are an indexed lookup rather than a scan over everyone's prose.
 */

/** Matches `[[key]]`, tolerating surrounding whitespace. */
const WIKI_LINK = /\[\[\s*([a-z0-9]+(?:-[a-z0-9]+)*)\s*\]\]/g;

export function extractLinks(body: string): string[] {
  const found = new Set<string>();
  for (const match of body.matchAll(WIKI_LINK)) {
    if (match[1]) found.add(match[1]);
  }
  return [...found].sort();
}

export interface CodexDraft {
  key: string;
  type: string;
  title: string;
  body: string;
  entityKey?: string | null;
  visibility?: 'private' | 'shared' | 'public';
}

async function ownedSystemId(
  db: Database,
  slug: string,
  ownerId: string,
): Promise<string | undefined> {
  const [row] = await db
    .select({ id: systems.id })
    .from(systems)
    .where(and(eq(systems.slug, slug), eq(systems.ownerId, ownerId)))
    .limit(1);
  return row?.id;
}

export async function upsertCodexEntry(
  db: Database,
  input: { systemSlug: string; ownerId: string; draft: CodexDraft },
): Promise<boolean> {
  const systemId = await ownedSystemId(db, input.systemSlug, input.ownerId);
  if (!systemId) return false;

  const { draft } = input;
  const links = extractLinks(draft.body);

  await db
    .insert(codexEntries)
    .values({
      systemId,
      ownerId: input.ownerId,
      type: draft.type,
      key: draft.key,
      title: draft.title,
      body: draft.body,
      links,
      entityKey: draft.entityKey ?? null,
      visibility: draft.visibility ?? 'private',
    })
    .onConflictDoUpdate({
      target: [codexEntries.systemId, codexEntries.key],
      set: {
        type: draft.type,
        title: draft.title,
        body: draft.body,
        links,
        entityKey: draft.entityKey ?? null,
        visibility: draft.visibility ?? 'private',
        updatedAt: new Date(),
      },
    });

  return true;
}

export async function deleteCodexEntry(
  db: Database,
  input: { systemSlug: string; ownerId: string; key: string },
): Promise<boolean> {
  const systemId = await ownedSystemId(db, input.systemSlug, input.ownerId);
  if (!systemId) return false;

  const deleted = await db
    .delete(codexEntries)
    .where(and(eq(codexEntries.systemId, systemId), eq(codexEntries.key, input.key)))
    .returning({ id: codexEntries.id });

  return deleted.length > 0;
}

export interface CodexSummary {
  key: string;
  type: string;
  title: string;
  visibility: string;
  entityKey: string | null;
}

export async function listCodexEntries(db: Database, systemSlug: string): Promise<CodexSummary[]> {
  return db
    .select({
      key: codexEntries.key,
      type: codexEntries.type,
      title: codexEntries.title,
      visibility: codexEntries.visibility,
      entityKey: codexEntries.entityKey,
    })
    .from(codexEntries)
    .innerJoin(systems, eq(codexEntries.systemId, systems.id))
    .where(eq(systems.slug, systemSlug))
    .orderBy(asc(codexEntries.type), asc(codexEntries.title));
}

export interface CodexEntryDetail extends CodexSummary {
  body: string;
  links: string[];
  /** Entries whose body links here. */
  backlinks: { key: string; title: string }[];
  /** Resolved mechanical binding, when `entityKey` names a real entity. */
  boundEntity?: { key: string; name: string; type: string };
}

export async function getCodexEntry(
  db: Database,
  systemSlug: string,
  key: string,
): Promise<CodexEntryDetail | undefined> {
  const [row] = await db
    .select({
      systemId: codexEntries.systemId,
      key: codexEntries.key,
      type: codexEntries.type,
      title: codexEntries.title,
      body: codexEntries.body,
      links: codexEntries.links,
      entityKey: codexEntries.entityKey,
      visibility: codexEntries.visibility,
    })
    .from(codexEntries)
    .innerJoin(systems, eq(codexEntries.systemId, systems.id))
    .where(and(eq(systems.slug, systemSlug), eq(codexEntries.key, key)))
    .limit(1);

  if (!row) return undefined;

  const backlinks = await db
    .select({ key: codexEntries.key, title: codexEntries.title })
    .from(codexEntries)
    .where(
      and(
        eq(codexEntries.systemId, row.systemId),
        sql`${codexEntries.links} @> ${JSON.stringify([key])}::jsonb`,
      ),
    )
    .orderBy(asc(codexEntries.title));

  let boundEntity: CodexEntryDetail['boundEntity'];
  if (row.entityKey) {
    const [entity] = await db
      .select({ key: entities.key, name: entities.name, type: entities.type })
      .from(entities)
      .where(and(eq(entities.systemId, row.systemId), eq(entities.key, row.entityKey)))
      .limit(1);
    if (entity) boundEntity = entity;
  }

  return {
    key: row.key,
    type: row.type,
    title: row.title,
    body: row.body,
    links: (row.links as string[]) ?? [],
    entityKey: row.entityKey,
    visibility: row.visibility,
    backlinks: backlinks.filter((b) => b.key !== key),
    ...(boundEntity ? { boundEntity } : {}),
  };
}

/**
 * Links pointing at entries that do not exist.
 *
 * Not an error — a link written before its target is a normal way to work, and
 * the Codex should encourage it. Surfacing them is how a world tells you what
 * it still owes you.
 */
export async function danglingLinks(
  db: Database,
  systemSlug: string,
): Promise<{ from: string; to: string }[]> {
  const entries = await db
    .select({ key: codexEntries.key, links: codexEntries.links })
    .from(codexEntries)
    .innerJoin(systems, eq(codexEntries.systemId, systems.id))
    .where(eq(systems.slug, systemSlug));

  const existing = new Set(entries.map((e) => e.key));
  const dangling: { from: string; to: string }[] = [];

  for (const entry of entries) {
    for (const target of (entry.links as string[]) ?? []) {
      if (!existing.has(target)) dangling.push({ from: entry.key, to: target });
    }
  }

  return dangling;
}
