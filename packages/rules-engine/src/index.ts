/**
 * @ttrpg/rules-engine
 *
 * PHASE 0 STUB. The implementation lands in Phase 1.
 *
 * Constraints this package must hold to, from PLAN.md §1:
 *
 *  - Pure TypeScript, ZERO runtime dependencies. The `dependencies` field in
 *    package.json stays empty.
 *  - Isomorphic: byte-identical behaviour on server and client. Offline play
 *    depends on this, so no Node built-ins, no DOM, no `globalThis` probing.
 *  - Deterministic: same inputs always produce the same derived sheet. Any
 *    randomness is injected by the caller, never sourced here.
 *  - Sandboxed: the formula DSL is parsed and interpreted. No `eval`, no
 *    `new Function`. All content is untrusted user input. Enforced by the
 *    no-eval / no-new-func lint rules in the root eslint.config.js.
 *  - Every derived number carries a provenance trace. This is a product
 *    feature and the engine's own test oracle.
 *
 * Nothing about 5e belongs in here. Six abilities, AC, proficiency bonus, and
 * spell slots are all defined in the `dnd5e-*` system modules using the same
 * primitives a user gets. If a 5e concept appears in this package, the central
 * architectural bet has been lost.
 */

export const ENGINE_VERSION = '0.0.0-phase0' as const;

/**
 * Marker for surfaces that are declared but not yet implemented.
 * Phase 1 replaces every call site.
 */
export class NotImplementedError extends Error {
  constructor(what: string) {
    super(`${what} is not implemented until Phase 1 (see PLAN.md work order)`);
    this.name = 'NotImplementedError';
  }
}
