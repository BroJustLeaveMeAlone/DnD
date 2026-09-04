import { z } from 'zod';
import { slug } from './ids.js';

/**
 * A character's build: the decisions a player made, never computed results.
 * See PLAN.md §1.
 *
 * This exists because build JSON arrives from the client — a form field, an
 * import, an API call — and is written straight to a JSONB column. Without
 * validation the database accumulates shapes the engine cannot resolve, and
 * the failure surfaces later as a broken sheet rather than a rejected request.
 */

export const abilityScore = z.number().int().min(1).max(30);

export const classEntry = z.object({
  key: slug,
  subclass: slug.optional(),
  level: z.number().int().min(1).max(20),
});

export const inventoryEntry = z.object({
  key: slug,
  equipped: z.boolean().optional(),
  attuned: z.boolean().optional(),
});

export const characterBuild = z.object({
  attributes: z.record(z.string().min(1).max(32), abilityScore),
  taken: z.array(slug).max(200).default([]),
  classes: z.array(classEntry).max(20).default([]),
  inventory: z.array(inventoryEntry).max(500).default([]),
  flags: z.array(z.string().min(1).max(64)).max(200).default([]),
});

export type CharacterBuildInput = z.input<typeof characterBuild>;
export type CharacterBuildOutput = z.output<typeof characterBuild>;

/** Total level across all classes. Multiclassing beyond 20 is invalid in 5e. */
export const totalLevel = (build: CharacterBuildOutput): number =>
  build.classes.reduce((sum, entry) => sum + entry.level, 0);
