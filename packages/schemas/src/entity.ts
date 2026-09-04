import { z } from 'zod';
import { characterIdSchema, entityIdSchema, slug, systemIdSchema } from './ids.js';

/**
 * Every kind of content the platform models. See PLAN.md §4.
 *
 * This list is deliberately open-ended at the system level: a custom system
 * may not use `subclass` or `spell` at all, and may organise its powers under
 * its own taxonomy. The type here is the *structural* kind, not the flavour.
 */
export const entityType = z.enum([
  'species',
  'lineage',
  'background',
  'class',
  'subclass',
  'feat',
  'power', // spells, techniques, invocations, manoeuvres — system decides the name
  'item',
  'monster',
  'condition',
  'damage-type',
  'rule',
  'encounter-table',
  'vehicle',
  'hazard',
  'deity',
  'language',
  'tool',
  'recipe',
  'downtime-activity',
]);
export type EntityType = z.infer<typeof entityType>;

/**
 * Where an entity lives.
 *
 * `system` — in the system's shared library; anyone playing it can take it.
 * `character` — belongs to exactly one character.
 *
 * Character scope is first-class, not an afterthought. A JJK cursed technique
 * is unique to one person, and systems outside D&D are full of content like
 * this. See PLAN.md §1. Retrofitting it later would be painful.
 */
export const entityScope = z.enum(['system', 'character']);
export type EntityScope = z.infer<typeof entityScope>;

/**
 * Provenance of a piece of content — which book, SRD release, or user
 * authored it. Drives source filtering and the CC-BY attribution notice.
 */
export const entitySource = z.object({
  /** e.g. `srd-5.1`, `srd-5.2.1`, `homebrew` */
  id: slug,
  /** Display name, e.g. "System Reference Document 5.2.1" */
  name: z.string().min(1).max(200),
  /** SPDX identifier or free text, e.g. `CC-BY-4.0`. Null for private content. */
  license: z.string().max(100).nullable().default(null),
});
export type EntitySource = z.infer<typeof entitySource>;

/**
 * The uniform content envelope from PLAN.md §1.
 *
 * `body` and `grants` are intentionally unvalidated here. They are the rules
 * engine's territory and are defined in Phase 1 (@ttrpg/rules-engine), where
 * the effect vocabulary, predicates, and formula DSL live. Phase 0 pins down
 * the envelope only — enough to store, index, fork, and version content.
 */
export const entityEnvelope = z.object({
  id: entityIdSchema,
  systemId: systemIdSchema,
  type: entityType,
  scope: entityScope.default('system'),
  /** Set if and only if `scope === 'character'`. */
  characterId: characterIdSchema.nullable().default(null),
  /** Stable within a system; survives forking. */
  key: slug,
  name: z.string().min(1).max(200),
  source: entitySource,
  /** Monotonic per entity. Consumers pin a version and opt in to updates. */
  version: z.number().int().nonnegative().default(0),

  // --- Phase 1 territory ---
  body: z.unknown(),
  grants: z.array(z.unknown()).default([]),
});
export type EntityEnvelope = z.infer<typeof entityEnvelope>;

/** Character-scoped entities must name their character; system-scoped must not. */
export const entity = entityEnvelope.refine(
  (e) => (e.scope === 'character') === (e.characterId !== null),
  {
    message: 'characterId must be set for character-scoped entities and null otherwise',
    path: ['characterId'],
  },
);
export type Entity = z.infer<typeof entity>;
