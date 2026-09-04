import type { BonusType, NumericOperation } from './effect.js';

/**
 * One line of a provenance trace. Suppressed entries are kept deliberately:
 * "your Ring of Protection is doing nothing because the Cloak already gives a
 * larger deflection bonus" is exactly the question a player asks, and hiding
 * the losers makes it unanswerable.
 */
export interface TraceEntry {
  sourceId: string;
  sourceName: string;
  sourceDetail?: string;
  operation: NumericOperation | 'base';
  amount: number;
  bonusType?: BonusType;
  applied: boolean;
  /** Why this did not apply. Present only when `applied` is false. */
  suppressedBy?: string;
}

export interface DerivedValue {
  value: number;
  trace: TraceEntry[];
}

export interface EvaluatedNumericEffect {
  operation: NumericOperation;
  amount: number;
  bonusType?: BonusType;
  sourceId: string;
  sourceName: string;
  sourceDetail?: string;
}

const traceFrom = (
  effect: EvaluatedNumericEffect,
  applied: boolean,
  suppressedBy?: string,
): TraceEntry => ({
  sourceId: effect.sourceId,
  sourceName: effect.sourceName,
  ...(effect.sourceDetail !== undefined ? { sourceDetail: effect.sourceDetail } : {}),
  operation: effect.operation,
  amount: effect.amount,
  ...(effect.bonusType !== undefined ? { bonusType: effect.bonusType } : {}),
  applied,
  ...(suppressedBy !== undefined ? { suppressedBy } : {}),
});

/** Highest wins, ties broken by first-seen so results are order-stable. */
function pickWinner<T extends { amount: number }>(
  candidates: T[],
  compare: (a: number, b: number) => boolean,
): T | undefined {
  let winner: T | undefined;
  for (const candidate of candidates) {
    if (!winner || compare(candidate.amount, winner.amount)) winner = candidate;
  }
  return winner;
}

/**
 * The stacking rules from PLAN.md §1, in order:
 *
 *  1. `set` establishes the base; the largest wins. This is how competing base
 *     calculations resolve — armour versus Unarmored Defense, without either
 *     needing to know the other exists.
 *  2. `add` sums. Untyped bonuses stack with everything; within a named bonus
 *     type only the largest applies.
 *  3. `floor` raises the result, largest floor winning.
 *  4. `cap` clamps it, smallest cap winning.
 *
 * A cap below a floor means the content is contradictory. The floor wins and a
 * diagnostic is raised rather than silently picking one, because a character
 * whose minimum exceeds their maximum is an authoring bug worth surfacing.
 */
export function stackNumeric(
  effects: readonly EvaluatedNumericEffect[],
  options: { base?: number } = {},
): DerivedValue {
  const trace: TraceEntry[] = [];

  const sets = effects.filter((e) => e.operation === 'set');
  const adds = effects.filter((e) => e.operation === 'add');
  const floors = effects.filter((e) => e.operation === 'floor');
  const caps = effects.filter((e) => e.operation === 'cap');

  // --- 1. base ---
  let value = options.base ?? 0;

  if (sets.length > 0) {
    const winner = pickWinner(sets, (a, b) => a > b)!;
    value = winner.amount;
    for (const effect of sets) {
      trace.push(
        effect === winner
          ? traceFrom(effect, true)
          : traceFrom(effect, false, `${winner.sourceName} sets a higher base`),
      );
    }
  } else if (options.base !== undefined) {
    trace.push({
      sourceId: 'system',
      sourceName: 'Base',
      operation: 'base',
      amount: options.base,
      applied: true,
    });
  }

  // --- 2. additive ---
  const untyped = adds.filter((e) => e.bonusType === undefined);
  for (const effect of untyped) {
    value += effect.amount;
    trace.push(traceFrom(effect, true));
  }

  const byType = new Map<BonusType, EvaluatedNumericEffect[]>();
  for (const effect of adds) {
    if (effect.bonusType === undefined) continue;
    const group = byType.get(effect.bonusType);
    if (group) group.push(effect);
    else byType.set(effect.bonusType, [effect]);
  }

  for (const [bonusType, group] of byType) {
    const winner = pickWinner(group, (a, b) => a > b)!;
    value += winner.amount;
    for (const effect of group) {
      trace.push(
        effect === winner
          ? traceFrom(effect, true)
          : traceFrom(
              effect,
              false,
              `a larger ${bonusType} bonus from ${winner.sourceName} applies instead`,
            ),
      );
    }
  }

  // --- 3. floors ---
  let appliedFloor: number | undefined;
  if (floors.length > 0) {
    const winner = pickWinner(floors, (a, b) => a > b)!;
    const raises = winner.amount > value;
    appliedFloor = winner.amount;
    if (raises) value = winner.amount;

    for (const effect of floors) {
      if (effect === winner) {
        trace.push(
          raises
            ? traceFrom(effect, true)
            : traceFrom(effect, false, 'the value already exceeds it'),
        );
      } else {
        trace.push(traceFrom(effect, false, `${winner.sourceName} sets a higher floor`));
      }
    }
  }

  // --- 4. caps ---
  if (caps.length > 0) {
    const winner = pickWinner(caps, (a, b) => a < b)!;
    const contradictsFloor = appliedFloor !== undefined && winner.amount < appliedFloor;
    const clamps = winner.amount < value;

    if (clamps && !contradictsFloor) value = winner.amount;

    for (const effect of caps) {
      if (effect !== winner) {
        trace.push(traceFrom(effect, false, `${winner.sourceName} sets a lower cap`));
      } else if (contradictsFloor) {
        trace.push(traceFrom(effect, false, 'it falls below an applied floor'));
      } else if (clamps) {
        trace.push(traceFrom(effect, true));
      } else {
        trace.push(traceFrom(effect, false, 'the value is already below it'));
      }
    }
  }

  return { value, trace };
}

/** Renders a trace the way the sheet shows it. Also the readable test oracle. */
export function formatTrace(target: string, derived: DerivedValue): string {
  const lines = derived.trace
    .filter((entry) => entry.applied)
    .map((entry) => {
      const sign = entry.operation === 'add' && entry.amount >= 0 ? '+' : '';
      const detail = entry.sourceDetail ? `  [${entry.sourceDetail}]` : '';
      return `  ${sign}${entry.amount}  ${entry.sourceName}${detail}`;
    });
  return [`${target} ${derived.value}`, ...lines].join('\n');
}
