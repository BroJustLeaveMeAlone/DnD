import { z } from 'zod';
import { entityType } from './entity.js';
import { slug } from './ids.js';

/**
 * Validation for authored content.
 *
 * Homebrew arrives from a form and is written to a JSONB column that the rules
 * engine later reads. An invalid shape here does not fail at the request — it
 * fails months later as a broken sheet, so the boundary is worth guarding
 * tightly.
 */

/** Formula source text. Parsing and semantic checks happen in the engine. */
export const formulaSource = z.string().min(1).max(1000);

export const numericOperation = z.enum(['add', 'set', 'floor', 'cap']);
export const proficiencyLevel = z.enum(['none', 'half', 'proficient', 'expertise']);
export const rechargeTrigger = z.enum([
  'short-rest',
  'long-rest',
  'dawn',
  'encounter',
  'turn',
  'never',
]);

/** Target keys become formula path segments, so no hyphens. */
export const statTarget = z
  .string()
  .min(1)
  .max(120)
  .regex(
    /^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)*$/,
    'must be dot-separated identifiers using letters, digits, and underscores',
  );

/** Free-form key for grants, which are pass-through and may use slugs. */
const grantTarget = z.string().min(1).max(120);

export const authoredEffect = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('numeric'),
    target: statTarget,
    operation: numericOperation,
    value: formulaSource,
    bonusType: z.string().max(60).optional(),
  }),
  z.object({
    kind: z.literal('proficiency'),
    target: statTarget,
    level: proficiencyLevel,
  }),
  z.object({
    kind: z.literal('roll-bias'),
    target: grantTarget,
    bias: z.enum(['advantage', 'disadvantage']),
  }),
  z.object({
    kind: z.literal('damage-response'),
    target: grantTarget,
    response: z.enum(['resistance', 'immunity', 'vulnerability']),
  }),
  z.object({
    kind: z.literal('resource'),
    target: statTarget,
    max: formulaSource,
    recharge: rechargeTrigger,
    tier: z.number().int().min(0).max(20).optional(),
  }),
  z.object({
    kind: z.literal('grant'),
    category: z.string().min(1).max(60),
    target: grantTarget,
    data: z.record(z.string(), z.unknown()).optional(),
  }),
]);

export type AuthoredEffect = z.infer<typeof authoredEffect>;

export const authoredPredicate: z.ZodType<AuthoredPredicate> = z.lazy(() =>
  z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('always') }),
    z.object({ kind: z.literal('never') }),
    z.object({ kind: z.literal('flag'), flag: z.string().min(1).max(64) }),
    z.object({ kind: z.literal('expression'), formula: formulaSource }),
    z.object({ kind: z.literal('all'), of: z.array(authoredPredicate).max(20) }),
    z.object({ kind: z.literal('any'), of: z.array(authoredPredicate).max(20) }),
    z.object({ kind: z.literal('not'), of: authoredPredicate }),
  ]),
);

export type AuthoredPredicate =
  | { kind: 'always' }
  | { kind: 'never' }
  | { kind: 'flag'; flag: string }
  | { kind: 'expression'; formula: string }
  | { kind: 'all'; of: AuthoredPredicate[] }
  | { kind: 'any'; of: AuthoredPredicate[] }
  | { kind: 'not'; of: AuthoredPredicate };

export const authoredGrant = z.object({
  effects: z.array(authoredEffect).min(1).max(50),
  atLevel: z.number().int().min(1).max(20).optional(),
  when: authoredPredicate.optional(),
  detail: z.string().max(120).optional(),
});

export const authoredEntity = z.object({
  key: slug,
  type: entityType,
  name: z.string().min(1).max(200),
  data: z.record(z.string(), z.unknown()).default({}),
  grants: z.array(authoredGrant).max(60).default([]),
});

export type AuthoredEntity = z.infer<typeof authoredEntity>;

export const systemFork = z.object({
  sourceSlug: slug,
  slug,
  name: z.string().min(1).max(200),
});
