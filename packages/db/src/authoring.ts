import { and, asc, eq, isNull, or, sql } from 'drizzle-orm';
import type { Database } from './client.js';
import { characters, entities, systems } from './schema/index.js';

/**
 * Writes for homebrew authoring: forking a ruleset, and creating or editing
 * the entities inside it.
 *
 * Every write is scoped by owner. A user may only author into a system they
 * own, which is checked in the WHERE clause rather than by a prior read.
 */

export interface ForkResult {
  systemId: string;
  slug: string;
  copiedEntities: number;
}

/**
 * Forks a system into one the user owns.
 *
 * Entities are copied rather than referenced. Referencing the parent would be
 * cheaper, but it means an upstream edit silently changes every fork — and the
 * whole point of forking is that your copy stops moving under you. PLAN.md's
 * versioning story depends on a fork being a snapshot.
 */
export async function forkSystem(
  db: Database,
  input: { sourceSlug: string; ownerId: string; slug: string; name: string },
): Promise<ForkResult> {
  const [source] = await db
    .select({
      id: systems.id,
      definition: systems.definition,
      dials: systems.dials,
      license: systems.license,
    })
    .from(systems)
    .where(eq(systems.slug, input.sourceSlug))
    .limit(1);

  if (!source) throw new Error(`Unknown system \`${input.sourceSlug}\``);

  const [created] = await db
    .insert(systems)
    .values({
      slug: input.slug,
      name: input.name,
      summary: `Forked from ${input.sourceSlug}`,
      ownerId: input.ownerId,
      forkedFromId: source.id,
      dials: source.dials,
      definition: source.definition,
      visibility: 'private',
      // A fork of CC-BY content stays CC-BY: the licence travels with the work.
      license: source.license,
    })
    .returning({ id: systems.id });

  if (!created) throw new Error('failed to create the fork');

  const copied = await db.execute(sql`
    insert into ${entities} (system_id, type, scope, character_id, key, name, source, body, grants, version)
    select ${created.id}, type, scope, character_id, key, name, source, body, grants, 0
    from ${entities}
    where system_id = ${source.id} and scope = 'system'
  `);

  return {
    systemId: created.id,
    slug: input.slug,
    copiedEntities: copied.rowCount ?? 0,
  };
}

export async function listOwnedSystems(db: Database, ownerId: string) {
  return db
    .select({
      slug: systems.slug,
      name: systems.name,
      summary: systems.summary,
      visibility: systems.visibility,
    })
    .from(systems)
    .where(eq(systems.ownerId, ownerId))
    .orderBy(asc(systems.name));
}

/** Resolves a system the caller is allowed to author into. */
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

export interface EntityDraft {
  key: string;
  type: string;
  name: string;
  data?: Record<string, unknown>;
  grants?: unknown[];
  /** Set to attach this entity to a single character rather than the library. */
  characterId?: string | null;
}

/**
 * Creates or updates an entity, bumping its version.
 *
 * Consumers pin a version and opt in to updates (PLAN.md §5), so the bump is
 * what makes an author's edit visible without silently rewriting live
 * characters.
 */
export async function upsertEntity(
  db: Database,
  input: { systemSlug: string; ownerId: string; draft: EntityDraft },
): Promise<boolean> {
  const systemId = await ownedSystemId(db, input.systemSlug, input.ownerId);
  if (!systemId) return false;

  const { draft } = input;
  const characterId = draft.characterId ?? null;

  await db
    .insert(entities)
    .values({
      systemId,
      type: draft.type,
      scope: characterId ? 'character' : 'system',
      characterId,
      key: draft.key,
      name: draft.name,
      source: { id: 'homebrew', name: 'Homebrew', license: null },
      body: { data: draft.data ?? {} },
      grants: draft.grants ?? [],
    })
    .onConflictDoUpdate({
      // Must match entities_system_key_unique exactly, including characterId —
      // otherwise an upsert for one character can collide with another's.
      target: [entities.systemId, entities.key, entities.characterId],
      set: {
        type: draft.type,
        name: draft.name,
        body: { data: draft.data ?? {} },
        grants: draft.grants ?? [],
        version: sql`${entities.version} + 1`,
        updatedAt: new Date(),
      },
    });

  return true;
}

export async function deleteEntity(
  db: Database,
  input: { systemSlug: string; ownerId: string; key: string },
): Promise<boolean> {
  const systemId = await ownedSystemId(db, input.systemSlug, input.ownerId);
  if (!systemId) return false;

  const deleted = await db
    .delete(entities)
    .where(and(eq(entities.systemId, systemId), eq(entities.key, input.key)))
    .returning({ id: entities.id });

  return deleted.length > 0;
}

/**
 * Entities visible to one character: the system library plus that character's
 * own private content. Character-scoped entities belonging to *other*
 * characters are excluded, which is the whole point of the scope.
 */
export async function entitiesForCharacter(db: Database, characterId: string) {
  const [character] = await db
    .select({ systemId: characters.systemId })
    .from(characters)
    .where(eq(characters.id, characterId))
    .limit(1);

  if (!character) return [];

  return db
    .select({
      key: entities.key,
      type: entities.type,
      name: entities.name,
      scope: entities.scope,
      body: entities.body,
      grants: entities.grants,
      version: entities.version,
    })
    .from(entities)
    .where(
      and(
        eq(entities.systemId, character.systemId),
        or(isNull(entities.characterId), eq(entities.characterId, characterId)),
      ),
    )
    .orderBy(asc(entities.type), asc(entities.name));
}
