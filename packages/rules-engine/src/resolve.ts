import {
  type BoundEffect,
  type DamageResponse,
  PROFICIENCY_RANK,
  type ProficiencyLevel,
} from './effect.js';
import type { FormulaValue } from './formula/index.js';
import { type PredicateScope, evaluatePredicate } from './predicate.js';
import {
  type DerivedValue,
  type EvaluatedNumericEffect,
  type TraceEntry,
  stackNumeric,
} from './stacking.js';

export interface Diagnostic {
  severity: 'error' | 'warning';
  code: 'circular-dependency' | 'unknown-reference' | 'formula-error' | 'contradictory-bounds';
  message: string;
  target?: string;
  sourceId?: string;
}

export interface ResolutionInput {
  /**
   * Raw inputs the character supplies rather than derives: chosen ability
   * scores, class levels, the results of decisions. Consulted before derived
   * stats, so a fact always wins over a computed value of the same name.
   */
  facts?: Readonly<Record<string, FormulaValue>>;
  /** Active transient states: raging, prone, concentrating, wearing-armour. */
  flags?: Iterable<string>;
  /** Base values a system module establishes before any effect applies. */
  bases?: Readonly<Record<string, number>>;
  effects: readonly BoundEffect[];
}

export interface ProficiencyResult {
  level: ProficiencyLevel;
  trace: { sourceId: string; sourceName: string; level: ProficiencyLevel; applied: boolean }[];
}

export interface ResourceResult {
  max: number;
  recharge: string;
  tier?: number;
  sourceId: string;
  sourceName: string;
}

export interface GrantResult {
  category: string;
  target: string;
  data?: Readonly<Record<string, unknown>>;
  sourceId: string;
  sourceName: string;
}

export interface DerivedSheet {
  stats: Readonly<Record<string, DerivedValue>>;
  proficiencies: Readonly<Record<string, ProficiencyResult>>;
  advantage: Readonly<Record<string, TraceEntry[]>>;
  disadvantage: Readonly<Record<string, TraceEntry[]>>;
  damageResponses: Readonly<Record<string, DamageResponse>>;
  resources: Readonly<Record<string, ResourceResult>>;
  grants: readonly GrantResult[];
  diagnostics: readonly Diagnostic[];
}

class CircularDependencyError extends Error {
  constructor(readonly cycle: string[]) {
    super(`Circular dependency: ${cycle.join(' -> ')}`);
    this.name = 'CircularDependencyError';
  }
}

/**
 * The resolution pipeline from PLAN.md §1.
 *
 * Numeric targets resolve lazily rather than in a precomputed topological
 * order. A formula referencing another stat triggers that stat's resolution on
 * demand, which means content authors never have to think about declaration
 * order — and a cycle is caught precisely where it closes, with the path
 * intact for the diagnostic.
 */
class Resolver implements PredicateScope {
  private readonly cache = new Map<string, DerivedValue>();
  private readonly inProgress: string[] = [];
  private readonly diagnostics: Diagnostic[] = [];

  /**
   * Facts and bases arrive as plain objects from callers. They are copied into
   * Maps rather than indexed directly, because `plainObject['constructor']`
   * resolves off the prototype chain and would let a formula reference reach a
   * host function. Object.entries takes own enumerable keys only.
   */
  private readonly facts: ReadonlyMap<string, FormulaValue>;
  private readonly flags: ReadonlySet<string>;
  private readonly bases: ReadonlyMap<string, number>;

  /**
   * All numeric effects grouped by target, including ones whose predicate
   * failed. Gated-off effects are kept so the stat still exists and its trace
   * can say *why* nothing applied — "your rage bonus is missing because you are
   * not raging" is the question players actually ask, and a stat that silently
   * vanishes cannot answer it.
   */
  private readonly numericByTarget = new Map<string, { bound: BoundEffect; active: boolean }[]>();
  private readonly active: BoundEffect[] = [];

  constructor(input: ResolutionInput) {
    this.facts = new Map(Object.entries(input.facts ?? {}));
    this.flags = new Set(input.flags ?? []);
    this.bases = new Map(Object.entries(input.bases ?? {}));

    // Filter by predicate once, up front. Predicates read facts and flags, not
    // derived stats, so this cannot depend on resolution order.
    for (const bound of input.effects) {
      const active = evaluatePredicate(bound.when, this);
      if (active) this.active.push(bound);

      if (bound.effect.kind === 'numeric') {
        const target = bound.effect.target;
        const group = this.numericByTarget.get(target);
        if (group) group.push({ bound, active });
        else this.numericByTarget.set(target, [{ bound, active }]);
      }
    }
  }

  hasFlag(name: string): boolean {
    return this.flags.has(name);
  }

  lookup(path: string): FormulaValue | undefined {
    const fact = this.facts.get(path);
    if (fact !== undefined) return fact;

    if (this.numericByTarget.has(path) || this.bases.has(path)) {
      return this.resolveStat(path).value;
    }
    return undefined;
  }

  private resolveStat(target: string): DerivedValue {
    const cached = this.cache.get(target);
    if (cached) return cached;

    if (this.inProgress.includes(target)) {
      throw new CircularDependencyError([...this.inProgress, target]);
    }
    this.inProgress.push(target);

    try {
      const evaluated: EvaluatedNumericEffect[] = [];
      const gatedOff: TraceEntry[] = [];

      for (const { bound, active } of this.numericByTarget.get(target) ?? []) {
        if (bound.effect.kind !== 'numeric') continue;

        if (!active) {
          // Best-effort value so the trace can show what it *would* contribute.
          let amount = 0;
          try {
            amount = bound.effect.value.evaluateNumber(this, { onMissingReference: () => 0 });
          } catch {
            // A gated-off effect with a broken formula is the linter's problem,
            // not a reason to lose the rest of the trace.
          }
          gatedOff.push({
            sourceId: bound.sourceId,
            sourceName: bound.sourceName,
            ...(bound.sourceDetail !== undefined ? { sourceDetail: bound.sourceDetail } : {}),
            operation: bound.effect.operation,
            amount,
            ...(bound.effect.bonusType !== undefined ? { bonusType: bound.effect.bonusType } : {}),
            applied: false,
            suppressedBy: 'its condition is not met',
          });
          continue;
        }

        try {
          evaluated.push({
            operation: bound.effect.operation,
            amount: bound.effect.value.evaluateNumber(this),
            ...(bound.effect.bonusType !== undefined ? { bonusType: bound.effect.bonusType } : {}),
            sourceId: bound.sourceId,
            sourceName: bound.sourceName,
            ...(bound.sourceDetail !== undefined ? { sourceDetail: bound.sourceDetail } : {}),
          });
        } catch (error) {
          if (error instanceof CircularDependencyError) throw error;
          // One broken formula must not take down the whole sheet. Drop this
          // effect, record why, and keep going — a half-configured homebrew
          // item should degrade, not crash. See PLAN.md §3.
          this.diagnostics.push({
            severity: 'error',
            code:
              error instanceof Error && /Unknown reference/.test(error.message)
                ? 'unknown-reference'
                : 'formula-error',
            message: `${bound.sourceName}: ${error instanceof Error ? error.message : String(error)}`,
            target,
            sourceId: bound.sourceId,
          });
        }
      }

      const base = this.bases.get(target);
      const derived = stackNumeric(evaluated, base !== undefined ? { base } : {});
      derived.trace.push(...gatedOff);

      for (const entry of derived.trace) {
        if (entry.suppressedBy === 'it falls below an applied floor') {
          this.diagnostics.push({
            severity: 'warning',
            code: 'contradictory-bounds',
            message: `${entry.sourceName} caps ${target} below a floor set elsewhere; the floor wins`,
            target,
            sourceId: entry.sourceId,
          });
        }
      }

      this.cache.set(target, derived);
      return derived;
    } catch (error) {
      if (error instanceof CircularDependencyError) {
        this.diagnostics.push({
          severity: 'error',
          code: 'circular-dependency',
          message: error.message,
          target,
        });
        const broken: DerivedValue = { value: 0, trace: [] };
        this.cache.set(target, broken);
        return broken;
      }
      throw error;
    } finally {
      this.inProgress.pop();
    }
  }

  resolve(): DerivedSheet {
    const stats: Record<string, DerivedValue> = {};
    const targets = new Set([...this.numericByTarget.keys(), ...this.bases.keys()]);
    for (const target of targets) {
      stats[target] = this.resolveStat(target);
    }

    const proficiencies: Record<string, ProficiencyResult> = {};
    const advantage: Record<string, TraceEntry[]> = {};
    const disadvantage: Record<string, TraceEntry[]> = {};
    const damageResponses: Record<string, DamageResponse> = {};
    const resources: Record<string, ResourceResult> = {};
    const grants: GrantResult[] = [];

    // Precedence, not cancellation. Whether resistance and vulnerability
    // annul each other is a rules question the system module answers; the
    // engine only reports the strongest response present.
    const responseRank: Record<DamageResponse, number> = {
      vulnerability: 1,
      resistance: 2,
      immunity: 3,
    };

    for (const bound of this.active) {
      const { effect } = bound;

      switch (effect.kind) {
        case 'numeric':
          break;

        case 'proficiency': {
          const existing = proficiencies[effect.target];
          const entry = {
            sourceId: bound.sourceId,
            sourceName: bound.sourceName,
            level: effect.level,
            applied: false,
          };
          if (!existing) {
            proficiencies[effect.target] = { level: effect.level, trace: [entry] };
          } else {
            existing.trace.push(entry);
            if (PROFICIENCY_RANK[effect.level] > PROFICIENCY_RANK[existing.level]) {
              existing.level = effect.level;
            }
          }
          break;
        }

        case 'roll-bias': {
          const bucket = effect.bias === 'advantage' ? advantage : disadvantage;
          (bucket[effect.target] ??= []).push({
            sourceId: bound.sourceId,
            sourceName: bound.sourceName,
            ...(bound.sourceDetail !== undefined ? { sourceDetail: bound.sourceDetail } : {}),
            operation: 'base',
            amount: 0,
            applied: true,
          });
          break;
        }

        case 'damage-response': {
          const current = damageResponses[effect.target];
          if (!current || responseRank[effect.response] > responseRank[current]) {
            damageResponses[effect.target] = effect.response;
          }
          break;
        }

        case 'resource': {
          let max = 0;
          try {
            max = effect.max.evaluateNumber(this);
          } catch (error) {
            this.diagnostics.push({
              severity: 'error',
              code: 'formula-error',
              message: `${bound.sourceName}: ${error instanceof Error ? error.message : String(error)}`,
              target: effect.target,
              sourceId: bound.sourceId,
            });
          }
          resources[effect.target] = {
            max,
            recharge: effect.recharge,
            ...(effect.tier !== undefined ? { tier: effect.tier } : {}),
            sourceId: bound.sourceId,
            sourceName: bound.sourceName,
          };
          break;
        }

        case 'grant':
          grants.push({
            category: effect.category,
            target: effect.target,
            ...(effect.data !== undefined ? { data: effect.data } : {}),
            sourceId: bound.sourceId,
            sourceName: bound.sourceName,
          });
          break;
      }
    }

    // Mark the winning proficiency entries now that every source has been seen.
    for (const result of Object.values(proficiencies)) {
      let marked = false;
      for (const entry of result.trace) {
        if (!marked && entry.level === result.level) {
          entry.applied = true;
          marked = true;
        }
      }
    }

    return {
      stats,
      proficiencies,
      advantage,
      disadvantage,
      damageResponses,
      resources,
      grants,
      diagnostics: this.diagnostics,
    };
  }
}

export function resolve(input: ResolutionInput): DerivedSheet {
  return new Resolver(input).resolve();
}
