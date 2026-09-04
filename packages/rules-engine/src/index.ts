/**
 * @ttrpg/rules-engine
 *
 * Constraints this package holds to, from PLAN.md §1:
 *
 *  - Pure TypeScript, ZERO runtime dependencies. Asserted by a test.
 *  - Isomorphic: identical on server and client. Offline play depends on it,
 *    so no Node built-ins, no DOM, no environment probing.
 *  - Deterministic: same inputs, same derived sheet. Randomness is injected by
 *    the caller and never sourced here.
 *  - Sandboxed: the formula DSL is tokenized, parsed, and interpreted. No
 *    `eval`, no `new Function`. All content is untrusted user input.
 *  - Every derived number carries a provenance trace.
 *
 * Nothing about 5e belongs in here. Six abilities, AC, proficiency bonus, and
 * spell slots are defined in the `dnd5e-*` system modules using the same
 * primitives a user gets. If a 5e concept appears in this package, the central
 * architectural bet has been lost.
 */

export const ENGINE_VERSION = '0.1.0' as const;

export * from './formula/index.js';
export * from './predicate.js';
export * from './effect.js';
export * from './stacking.js';
export * from './resolve.js';
