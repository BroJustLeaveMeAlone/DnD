import { z } from 'zod';
import { slug, systemIdSchema, userIdSchema } from './ids.js';

/**
 * The independently-dialled parts of a game system. See PLAN.md §2.
 *
 * There are no difficulty tiers and no graduation. A system is these dials,
 * each set on its own. Jujutsu Kaisen is six moved and three left alone; a 5e
 * house rule is one moved. Same interface either way.
 */
export const subsystem = z.enum([
  'attributes',
  'derived-stats',
  'progression',
  'resources',
  'powers',
  'combat-resolution',
  'health-damage',
  'items',
  'conditions',
  'creation-flow',
]);
export type Subsystem = z.infer<typeof subsystem>;

/**
 * `inherited` — using the parent system's, untouched.
 * `tweaked`   — the parent's, modified through guided UI. No formulas required.
 * `replaced`  — authored from scratch.
 *
 * Anything not `replaced` falls back to the parent, so a system is always
 * playable mid-construction. There is no broken half-built state.
 */
export const dialState = z.enum(['inherited', 'tweaked', 'replaced']);
export type DialState = z.infer<typeof dialState>;

export const visibility = z.enum(['private', 'campaign', 'public']);
export type Visibility = z.infer<typeof visibility>;

/**
 * Per-work licence, chosen by the creator. See PLAN.md §11.
 * `all-rights-reserved` content can be forked only by its owner.
 */
export const contentLicense = z.enum([
  'CC0-1.0',
  'CC-BY-4.0',
  'CC-BY-SA-4.0',
  'all-rights-reserved',
]);
export type ContentLicense = z.infer<typeof contentLicense>;

export const gameSystem = z.object({
  id: systemIdSchema,
  slug,
  name: z.string().min(1).max(200),
  summary: z.string().max(2000).default(''),
  ownerId: userIdSchema,

  /**
   * Nothing starts from a blank page — every system is a fork of one that
   * works. Null only for the seeded 5e modules at the root of the tree.
   */
  forkedFromId: systemIdSchema.nullable().default(null),

  /**
   * Dials left unset default to `inherited`.
   * `partialRecord` rather than `record`: a system declares only the dials it
   * has an opinion about, and `record` over an enum demands every key.
   */
  dials: z.partialRecord(subsystem, dialState).default({}),

  visibility: visibility.default('private'),
  license: contentLicense.default('all-rights-reserved'),
  version: z.number().int().nonnegative().default(0),
});
export type GameSystem = z.infer<typeof gameSystem>;

/** A dial is only meaningfully `inherited` if there is a parent to inherit from. */
export const validatedGameSystem = gameSystem.refine(
  (s) => s.forkedFromId !== null || Object.values(s.dials).every((state) => state === 'replaced'),
  {
    message: 'a system with no parent must replace every dial it declares',
    path: ['dials'],
  },
);
