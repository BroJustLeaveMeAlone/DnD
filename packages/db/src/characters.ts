import type {
  AttributeDefinition,
  CharacterBuild,
  DerivedStatDefinition,
  ModuleEntity,
  SystemModule,
} from '@ttrpg/rules-engine';
import { deserializeGrant } from '@ttrpg/rules-engine';
import { and, asc, eq } from 'drizzle-orm';
import type { Database } from './client.js';
import { characters, entities, systems } from './schema/index.js';

/**
 * Loading a system out of the database and building characters against it.
 *
 * Characters resolve against DB content, never against the bundled TypeScript
 * modules. Those are a seed, not a runtime dependency — the moment a user
 * forks a ruleset or writes homebrew, the database is the only source of truth,
 * and a code path that reads the TS modules would quietly ignore their edits.
 */

interface StoredDefinition {
  attributes?: AttributeDefinition[];
  derived?: DerivedStatDefinition[];
  /** Serialised the same way entity grants are — they carry formulas too. */
  rules?: Record<string, unknown>[];
  proficiencyScale?: SystemModule['proficiencyScale'];
  source?: SystemModule['source'];
}

export async function loadSystemModule(
  db: Database,
  systemSlug: string,
): Promise<SystemModule | undefined> {
  const [system] = await db
    .select({
      id: systems.id,
      slug: systems.slug,
      name: systems.name,
      definition: systems.definition,
    })
    .from(systems)
    .where(eq(systems.slug, systemSlug))
    .limit(1);

  if (!system) return undefined;

  const definition = (system.definition ?? {}) as StoredDefinition;

  const rows = await db
    .select({
      key: entities.key,
      type: entities.type,
      name: entities.name,
      body: entities.body,
      grants: entities.grants,
    })
    .from(entities)
    .where(and(eq(entities.systemId, system.id), eq(entities.scope, 'system')))
    .orderBy(asc(entities.key));

  const moduleEntities: ModuleEntity[] = rows.map((row) => ({
    key: row.key,
    type: row.type,
    name: row.name,
    data: ((row.body as { data?: Record<string, unknown> })?.data ?? {}) as Record<string, unknown>,
    grants: ((row.grants as Record<string, unknown>[]) ?? []).map(deserializeGrant),
  }));

  return {
    id: system.slug,
    name: system.name,
    source: definition.source ?? { id: system.slug, name: system.name, license: null },
    attributes: definition.attributes ?? [],
    derived: definition.derived ?? [],
    rules: (definition.rules ?? []).map(deserializeGrant),
    ...(definition.proficiencyScale ? { proficiencyScale: definition.proficiencyScale } : {}),
    entities: moduleEntities,
  };
}

export interface CharacterRecord {
  id: string;
  name: string;
  ownerId: string;
  systemSlug: string;
  systemName: string;
  build: CharacterBuild;
  state: Record<string, unknown>;
  updatedAt: Date;
}

export async function listCharacters(db: Database, ownerId: string): Promise<CharacterRecord[]> {
  const rows = await db
    .select({
      id: characters.id,
      name: characters.name,
      ownerId: characters.ownerId,
      build: characters.build,
      state: characters.state,
      updatedAt: characters.updatedAt,
      systemSlug: systems.slug,
      systemName: systems.name,
    })
    .from(characters)
    .innerJoin(systems, eq(characters.systemId, systems.id))
    .where(eq(characters.ownerId, ownerId))
    .orderBy(asc(characters.name));

  return rows.map((row) => ({
    ...row,
    build: row.build as CharacterBuild,
    state: (row.state ?? {}) as Record<string, unknown>,
  }));
}

export async function getCharacter(db: Database, id: string): Promise<CharacterRecord | undefined> {
  const [row] = await db
    .select({
      id: characters.id,
      name: characters.name,
      ownerId: characters.ownerId,
      build: characters.build,
      state: characters.state,
      updatedAt: characters.updatedAt,
      systemSlug: systems.slug,
      systemName: systems.name,
    })
    .from(characters)
    .innerJoin(systems, eq(characters.systemId, systems.id))
    .where(eq(characters.id, id))
    .limit(1);

  if (!row) return undefined;
  return {
    ...row,
    build: row.build as CharacterBuild,
    state: (row.state ?? {}) as Record<string, unknown>,
  };
}

export async function createCharacter(
  db: Database,
  input: { ownerId: string; systemSlug: string; name: string; build: CharacterBuild },
): Promise<string> {
  const [system] = await db
    .select({ id: systems.id })
    .from(systems)
    .where(eq(systems.slug, input.systemSlug))
    .limit(1);

  if (!system) throw new Error(`Unknown system \`${input.systemSlug}\``);

  const [created] = await db
    .insert(characters)
    .values({
      ownerId: input.ownerId,
      systemId: system.id,
      name: input.name,
      build: input.build,
    })
    .returning({ id: characters.id });

  if (!created) throw new Error('failed to create character');
  return created.id;
}

export async function updateCharacterBuild(
  db: Database,
  id: string,
  ownerId: string,
  build: CharacterBuild,
): Promise<boolean> {
  const updated = await db
    .update(characters)
    // Ownership is part of the WHERE clause rather than a prior read, so a
    // mismatched owner updates zero rows instead of racing a check.
    .set({ build, updatedAt: new Date() })
    .where(and(eq(characters.id, id), eq(characters.ownerId, ownerId)))
    .returning({ id: characters.id });

  return updated.length > 0;
}

export async function deleteCharacter(db: Database, id: string, ownerId: string): Promise<boolean> {
  const deleted = await db
    .delete(characters)
    .where(and(eq(characters.id, id), eq(characters.ownerId, ownerId)))
    .returning({ id: characters.id });

  return deleted.length > 0;
}
