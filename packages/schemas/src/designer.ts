import { z } from 'zod';
import { formulaSource, statTarget } from './authoring.js';
import { dialState, subsystem } from './system.js';

/**
 * The System Designer's editable surface: what a system *is*, before any
 * content exists in it. See PLAN.md §2.
 *
 * Every field here is data a user can change. There are no difficulty tiers —
 * each subsystem is a dial set independently, and anything left `inherited`
 * falls back to the parent, so a system is always playable mid-construction.
 */

/** Identifier used in formula paths, so no hyphens. */
export const attributeKey = z
  .string()
  .min(1)
  .max(32)
  .regex(
    /^[a-z_][a-z0-9_]*$/,
    'lowercase letters, digits, and underscores; must not start with a digit',
  );

export const attributeDefinition = z.object({
  key: attributeKey,
  name: z.string().min(1).max(60),
  abbreviation: z.string().min(1).max(8),
  /**
   * How the modifier derives from the score. Must reference
   * `attr.<key>.score` in full — see the note in the engine's
   * AttributeDefinition for why this is explicit rather than templated.
   */
  modifier: formulaSource.optional(),
  default: z.number().int().min(0).max(999).default(10),
});

export const derivedStatDefinition = z
  .object({
    key: statTarget,
    name: z.string().min(1).max(60),
    base: z.number().min(-9999).max(9999).optional(),
    formula: formulaSource.optional(),
    /** Presentation hints for the auto-generated sheet. */
    display: z
      .object({ signed: z.boolean().optional(), suffix: z.string().max(8).optional() })
      .optional(),
  })
  .refine((d) => d.base !== undefined || d.formula !== undefined, {
    message: 'a derived stat needs either a base or a formula',
    path: ['base'],
  });

export const proficiencyScale = z.object({
  none: z.number().min(-10).max(10).default(0),
  half: z.number().min(-10).max(10).default(0.5),
  proficient: z.number().min(-10).max(10).default(1),
  expertise: z.number().min(-10).max(10).default(2),
});

export const systemDefinition = z.object({
  attributes: z.array(attributeDefinition).max(30),
  derived: z.array(derivedStatDefinition).max(300),
  proficiencyScale: proficiencyScale.optional(),
});

export type SystemDefinition = z.infer<typeof systemDefinition>;

export const dialSettings = z.partialRecord(subsystem, dialState);
export type DialSettings = z.infer<typeof dialSettings>;

/**
 * Duplicate keys are the failure this catches. Two attributes named `str`
 * silently shadow each other in the formula scope, and the resulting sheet is
 * wrong in a way no single value looks wrong.
 */
export const validatedSystemDefinition = systemDefinition
  .refine((d) => new Set(d.attributes.map((a) => a.key)).size === d.attributes.length, {
    message: 'attribute keys must be unique',
    path: ['attributes'],
  })
  .refine((d) => new Set(d.derived.map((s) => s.key)).size === d.derived.length, {
    message: 'derived stat keys must be unique',
    path: ['derived'],
  })
  .refine(
    (d) => {
      const attributePaths = new Set(
        d.attributes.flatMap((a) => [`attr.${a.key}.score`, `attr.${a.key}.mod`]),
      );
      return d.derived.every((s) => !attributePaths.has(s.key));
    },
    { message: 'a derived stat may not shadow an attribute path', path: ['derived'] },
  );
