import { z } from 'zod';

/**
 * Combat encounter state.
 *
 * Stored as one JSONB document per encounter rather than normalised into
 * tables. A combat round is read and written whole, dozens of times a session,
 * and always by one GM — so a document avoids a join per combatant and keeps
 * each turn advance a single atomic write. It also makes the whole encounter
 * trivially replayable, which the Phase 15 simulator will want.
 */

export const combatantSide = z.enum(['party', 'foe', 'neutral']);

export const activeCondition = z.object({
  key: z.string().min(1).max(64),
  /** Rounds left, or null for "until removed". */
  rounds: z.number().int().min(0).max(1000).nullable().default(null),
  /** Who applied it, for the log. */
  source: z.string().max(120).optional(),
});

export const combatant = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(200),
  side: combatantSide.default('foe'),
  initiative: z.number().int().min(-50).max(100).default(0),
  /**
   * Tie-break value, rolled once when initiative is set. Re-deriving ties from
   * a modifier each render would reorder the list mid-combat.
   */
  tiebreak: z.number().min(0).max(1).default(0),

  hp: z.object({
    current: z.number().int().min(-1000).max(10_000),
    max: z.number().int().min(0).max(10_000),
    temporary: z.number().int().min(0).max(10_000).default(0),
  }),

  ac: z.number().int().min(0).max(100).default(10),
  conditions: z.array(activeCondition).max(50).default([]),

  /** Set when this combatant is a real character in the campaign. */
  characterId: z.uuid().nullable().default(null),
  /** Set when concentrating; shown so the GM can prompt a save on damage. */
  concentratingOn: z.string().max(120).nullable().default(null),

  /** Death saves, for combatants that use them. */
  deathSaves: z
    .object({
      successes: z.number().int().min(0).max(3).default(0),
      failures: z.number().int().min(0).max(3).default(0),
    })
    .default({ successes: 0, failures: 0 }),

  defeated: z.boolean().default(false),
});

export type Combatant = z.infer<typeof combatant>;

export const combatLogEntry = z.object({
  round: z.number().int().min(0),
  message: z.string().min(1).max(500),
  at: z.string(),
});

export const encounterState = z.object({
  round: z.number().int().min(0).max(1000).default(0),
  /** Index into the initiative order. */
  turn: z.number().int().min(0).max(500).default(0),
  started: z.boolean().default(false),
  combatants: z.array(combatant).max(200).default([]),
  log: z.array(combatLogEntry).max(500).default([]),
});

export type EncounterState = z.infer<typeof encounterState>;

/**
 * Initiative order: highest first, ties broken by the stored tiebreak.
 *
 * Sorting is derived rather than stored, so editing one combatant's initiative
 * cannot leave a stale order behind.
 */
export function initiativeOrder(combatants: Combatant[]): Combatant[] {
  return [...combatants].sort(
    (a, b) =>
      b.initiative - a.initiative || b.tiebreak - a.tiebreak || a.name.localeCompare(b.name),
  );
}
