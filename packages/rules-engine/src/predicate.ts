import { Formula, type FormulaScope } from './formula/index.js';

/**
 * When an effect applies. See PLAN.md §1.
 *
 * `flag` covers transient states the sheet toggles — raging, wearing no armour,
 * concentrating. `expression` covers anything computable from the context, so
 * `if level >= 5` needs no new predicate kind.
 */
export type Predicate =
  | { kind: 'always' }
  | { kind: 'never' }
  | { kind: 'flag'; flag: string }
  | { kind: 'expression'; formula: Formula }
  | { kind: 'all'; of: Predicate[] }
  | { kind: 'any'; of: Predicate[] }
  | { kind: 'not'; of: Predicate };

export const always: Predicate = { kind: 'always' };
export const never: Predicate = { kind: 'never' };
export const flag = (name: string): Predicate => ({ kind: 'flag', flag: name });
export const expression = (source: string): Predicate => ({
  kind: 'expression',
  formula: Formula.parse(source),
});
export const all = (...of: Predicate[]): Predicate => ({ kind: 'all', of });
export const any = (...of: Predicate[]): Predicate => ({ kind: 'any', of });
export const not = (of: Predicate): Predicate => ({ kind: 'not', of });

export interface PredicateScope extends FormulaScope {
  hasFlag(flag: string): boolean;
}

/**
 * A predicate that cannot be decided — usually because it references something
 * missing — evaluates to `false` rather than throwing. A half-configured
 * homebrew item should not take the whole sheet down; the linter reports it
 * instead. See PLAN.md §3.
 */
export function evaluatePredicate(predicate: Predicate, scope: PredicateScope): boolean {
  switch (predicate.kind) {
    case 'always':
      return true;
    case 'never':
      return false;
    case 'flag':
      return scope.hasFlag(predicate.flag);
    case 'expression':
      try {
        return predicate.formula.evaluateBoolean(scope, { onMissingReference: () => 0 });
      } catch {
        return false;
      }
    case 'all':
      return predicate.of.every((p) => evaluatePredicate(p, scope));
    case 'any':
      return predicate.of.some((p) => evaluatePredicate(p, scope));
    case 'not':
      return !evaluatePredicate(predicate.of, scope);
  }
}

/** Every flag a predicate can observe. Drives the sheet's condition toggles. */
export function flagsOf(predicate: Predicate, into: Set<string> = new Set()): Set<string> {
  switch (predicate.kind) {
    case 'flag':
      into.add(predicate.flag);
      break;
    case 'all':
    case 'any':
      for (const p of predicate.of) flagsOf(p, into);
      break;
    case 'not':
      flagsOf(predicate.of, into);
      break;
    default:
      break;
  }
  return into;
}
