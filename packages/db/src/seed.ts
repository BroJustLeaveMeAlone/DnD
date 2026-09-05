import type { SystemModule } from '@ttrpg/rules-engine';
import { serializeGrant } from '@ttrpg/rules-engine';
import { sql } from 'drizzle-orm';
import type { Database } from './client.js';
import { entities, systems } from './schema/index.js';
import { findOrCreateUserRow } from './upsert.js';

/**
 * Ingests a SystemModule into Postgres.
 *
 * Idempotent: re-running updates in place rather than duplicating, so seeding
 * is safe to repeat on every deploy and during development.
 */

/** Owner of bundled SRD content. Not a sign-in-able account — no auth rows. */
const SYSTEM_ACCOUNT = {
  email: 'system@ttrpg.local',
  name: 'System',
  handle: 'system',
} as const;

/** Idempotent and safe under concurrency — see `findOrCreateUserRow`. */
export async function ensureSystemAccount(db: Database): Promise<string> {
  return findOrCreateUserRow(db, { ...SYSTEM_ACCOUNT });
}

export interface SeedResult {
  systemId: string;
  slug: string;
  entities: number;
}

export async function seedSystemModule(
  db: Database,
  module: SystemModule,
  ownerId: string,
): Promise<SeedResult> {
  const [system] = await db
    .insert(systems)
    .values({
      slug: module.id,
      name: module.name,
      summary: `${module.source.name}${module.source.license ? ` (${module.source.license})` : ''}`,
      ownerId,
      // Bundled rulesets are public and sit at the root of the fork tree.
      visibility: 'public',
      license: 'CC-BY-4.0',
      dials: sql`'{}'::jsonb`,
      definition: {
        attributes: module.attributes,
        derived: module.derived,
        proficiencyScale: module.proficiencyScale,
        source: module.source,
      },
    })
    .onConflictDoUpdate({
      target: systems.slug,
      set: {
        name: module.name,
        definition: {
          attributes: module.attributes,
          derived: module.derived,
          proficiencyScale: module.proficiencyScale,
          source: module.source,
        },
        updatedAt: new Date(),
      },
    })
    .returning({ id: systems.id });

  if (!system) throw new Error(`failed to upsert system \`${module.id}\``);

  const rows = module.entities.map((entity) => ({
    systemId: system.id,
    type: entity.type,
    scope: 'system' as const,
    key: entity.key,
    name: entity.name,
    source: module.source,
    // `body` carries what the compendium renders; `grants` carries mechanics.
    body: { data: entity.data ?? {} },
    grants: (entity.grants ?? []).map(serializeGrant),
  }));

  if (rows.length > 0) {
    await db
      .insert(entities)
      .values(rows)
      .onConflictDoUpdate({
        // Must name every column in entities_system_key_unique, or Postgres
        // cannot infer the arbiter index (42P10).
        target: [entities.systemId, entities.key, entities.characterId],
        set: {
          name: sql`excluded.name`,
          type: sql`excluded.type`,
          body: sql`excluded.body`,
          grants: sql`excluded.grants`,
          source: sql`excluded.source`,
          version: sql`${entities.version} + 1`,
          updatedAt: new Date(),
        },
      });
  }

  return { systemId: system.id, slug: module.id, entities: rows.length };
}
