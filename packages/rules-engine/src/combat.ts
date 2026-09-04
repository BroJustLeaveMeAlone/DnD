/**
 * Combat state transitions.
 *
 * Pure functions: state in, new state out, no mutation and no I/O. That keeps
 * them testable without a database, lets the client apply a change optimistically
 * and the server apply the identical one authoritatively, and makes an encounter
 * replayable from its log.
 *
 * Nothing here is 5e-specific. Damage, temporary hit points, and conditions are
 * generic; the 10-point concentration threshold is passed in rather than
 * assumed, because that number is a 5e rule.
 */

export interface CombatantState {
  id: string;
  name: string;
  initiative: number;
  tiebreak: number;
  hp: { current: number; max: number; temporary: number };
  conditions: { key: string; rounds: number | null; source?: string }[];
  concentratingOn: string | null;
  deathSaves: { successes: number; failures: number };
  defeated: boolean;
  [key: string]: unknown;
}

export interface EncounterLike {
  round: number;
  turn: number;
  started: boolean;
  combatants: CombatantState[];
  log: { round: number; message: string; at: string }[];
  [key: string]: unknown;
}

export interface TransitionOptions {
  /** Timestamp for log entries; injected so transitions stay deterministic. */
  now?: () => string;
  /**
   * Damage at or above this forces a concentration check. In 5e it is
   * `max(10, floor(damage / 2))`; a system with no concentration passes null.
   */
  concentrationThreshold?: number | null;
}

const order = (combatants: CombatantState[]): CombatantState[] =>
  [...combatants].sort(
    (a, b) =>
      b.initiative - a.initiative || b.tiebreak - a.tiebreak || a.name.localeCompare(b.name),
  );

const withLog = (encounter: EncounterLike, message: string, now: () => string): EncounterLike => ({
  ...encounter,
  log: [...encounter.log, { round: encounter.round, message, at: now() }].slice(-500),
});

const replace = (
  encounter: EncounterLike,
  id: string,
  update: (c: CombatantState) => CombatantState,
): EncounterLike => ({
  ...encounter,
  combatants: encounter.combatants.map((c) => (c.id === id ? update(c) : c)),
});

export interface DamageResult {
  encounter: EncounterLike;
  /** Damage that got through after temporary hit points absorbed their share. */
  applied: number;
  absorbedByTemporary: number;
  /** True when the target must roll to keep concentration. */
  concentrationAtRisk: boolean;
  droppedToZero: boolean;
}

/**
 * Applies damage, spending temporary hit points first.
 *
 * Temporary hit points are not healing and do not stack with current HP — they
 * are a separate pool that absorbs damage before it reaches you. Getting this
 * backwards silently inflates every character's effective health.
 */
export function applyDamage(
  encounter: EncounterLike,
  id: string,
  amount: number,
  options: TransitionOptions = {},
): DamageResult {
  const now = options.now ?? (() => new Date().toISOString());
  const target = encounter.combatants.find((c) => c.id === id);

  if (!target || amount <= 0) {
    return {
      encounter,
      applied: 0,
      absorbedByTemporary: 0,
      concentrationAtRisk: false,
      droppedToZero: false,
    };
  }

  const absorbed = Math.min(target.hp.temporary, amount);
  const applied = amount - absorbed;
  const current = target.hp.current - applied;
  const droppedToZero = target.hp.current > 0 && current <= 0;

  const threshold = options.concentrationThreshold;
  const concentrationAtRisk =
    target.concentratingOn !== null && threshold !== null && threshold !== undefined
      ? amount >= threshold
      : false;

  let next = replace(encounter, id, (c) => ({
    ...c,
    hp: { ...c.hp, current, temporary: c.hp.temporary - absorbed },
    // Dropping to zero ends concentration outright; no save is offered.
    concentratingOn: current <= 0 ? null : c.concentratingOn,
    defeated: c.defeated || current <= 0,
  }));

  next = withLog(next, `${target.name} takes ${amount} damage`, now);
  if (droppedToZero) next = withLog(next, `${target.name} drops to 0`, now);

  return {
    encounter: next,
    applied,
    absorbedByTemporary: absorbed,
    concentrationAtRisk,
    droppedToZero,
  };
}

export function applyHealing(
  encounter: EncounterLike,
  id: string,
  amount: number,
  options: TransitionOptions = {},
): EncounterLike {
  const now = options.now ?? (() => new Date().toISOString());
  const target = encounter.combatants.find((c) => c.id === id);
  if (!target || amount <= 0) return encounter;

  const current = Math.min(target.hp.max, Math.max(0, target.hp.current) + amount);

  return withLog(
    replace(encounter, id, (c) => ({
      ...c,
      hp: { ...c.hp, current },
      // Healing from zero clears death saves and revives.
      deathSaves: current > 0 ? { successes: 0, failures: 0 } : c.deathSaves,
      defeated: current > 0 ? false : c.defeated,
    })),
    `${target.name} heals ${amount}`,
    now,
  );
}

/** Temporary hit points replace rather than stack — the larger pool wins. */
export function grantTemporaryHitPoints(
  encounter: EncounterLike,
  id: string,
  amount: number,
): EncounterLike {
  return replace(encounter, id, (c) => ({
    ...c,
    hp: { ...c.hp, temporary: Math.max(c.hp.temporary, Math.max(0, amount)) },
  }));
}

export function addCondition(
  encounter: EncounterLike,
  id: string,
  condition: { key: string; rounds?: number | null; source?: string },
  options: TransitionOptions = {},
): EncounterLike {
  const now = options.now ?? (() => new Date().toISOString());
  const target = encounter.combatants.find((c) => c.id === id);
  if (!target) return encounter;

  const next = replace(encounter, id, (c) => ({
    ...c,
    conditions: [
      // Re-applying refreshes duration rather than stacking a duplicate.
      ...c.conditions.filter((existing) => existing.key !== condition.key),
      {
        key: condition.key,
        rounds: condition.rounds ?? null,
        ...(condition.source !== undefined ? { source: condition.source } : {}),
      },
    ],
  }));

  return withLog(next, `${target.name} is ${condition.key}`, now);
}

export function removeCondition(encounter: EncounterLike, id: string, key: string): EncounterLike {
  return replace(encounter, id, (c) => ({
    ...c,
    conditions: c.conditions.filter((condition) => condition.key !== key),
  }));
}

export function setConcentration(
  encounter: EncounterLike,
  id: string,
  on: string | null,
): EncounterLike {
  return replace(encounter, id, (c) => ({ ...c, concentratingOn: on }));
}

export function recordDeathSave(
  encounter: EncounterLike,
  id: string,
  success: boolean,
  options: TransitionOptions = {},
): EncounterLike {
  const now = options.now ?? (() => new Date().toISOString());
  const target = encounter.combatants.find((c) => c.id === id);
  if (!target) return encounter;

  const successes = target.deathSaves.successes + (success ? 1 : 0);
  const failures = target.deathSaves.failures + (success ? 0 : 1);

  let next = replace(encounter, id, (c) => ({
    ...c,
    deathSaves: { successes: Math.min(3, successes), failures: Math.min(3, failures) },
    // Three successes stabilises: still at 0 HP, no longer dying.
    defeated: failures >= 3 ? true : c.defeated,
  }));

  if (successes >= 3) next = withLog(next, `${target.name} stabilises`, now);
  if (failures >= 3) next = withLog(next, `${target.name} dies`, now);

  return next;
}

export function startEncounter(
  encounter: EncounterLike,
  options: TransitionOptions = {},
): EncounterLike {
  const now = options.now ?? (() => new Date().toISOString());
  if (encounter.started || encounter.combatants.length === 0) return encounter;

  return withLog({ ...encounter, started: true, round: 1, turn: 0 }, 'Combat begins', now);
}

export interface AdvanceResult {
  encounter: EncounterLike;
  /** Conditions that expired on this transition, for the GM to see. */
  expired: { combatant: string; condition: string }[];
}

/**
 * Advances to the next turn, wrapping into the next round.
 *
 * Condition durations tick down at the *end* of the affected combatant's turn,
 * which is when a "lasts 1 round" effect should fall off — not at the end of
 * the round, which would make its length depend on initiative order.
 */
export function nextTurn(encounter: EncounterLike, options: TransitionOptions = {}): AdvanceResult {
  const now = options.now ?? (() => new Date().toISOString());
  if (!encounter.started || encounter.combatants.length === 0) {
    return { encounter, expired: [] };
  }

  const ordered = order(encounter.combatants);
  const current = ordered[encounter.turn % ordered.length];
  const expired: { combatant: string; condition: string }[] = [];

  let next = encounter;

  if (current) {
    const ticked = current.conditions
      .map((condition) =>
        condition.rounds === null ? condition : { ...condition, rounds: condition.rounds - 1 },
      )
      .filter((condition) => {
        if (condition.rounds !== null && condition.rounds <= 0) {
          expired.push({ combatant: current.name, condition: condition.key });
          return false;
        }
        return true;
      });

    next = replace(next, current.id, (c) => ({ ...c, conditions: ticked }));
  }

  const wrapped = encounter.turn + 1 >= ordered.length;
  next = {
    ...next,
    turn: wrapped ? 0 : encounter.turn + 1,
    round: wrapped ? encounter.round + 1 : encounter.round,
  };

  for (const { combatant, condition } of expired) {
    next = withLog(next, `${condition} ends on ${combatant}`, now);
  }
  if (wrapped) next = withLog(next, `Round ${next.round}`, now);

  return { encounter: next, expired };
}

/** Whose turn it is, or undefined before combat starts. */
export function activeCombatant(encounter: EncounterLike): CombatantState | undefined {
  if (!encounter.started || encounter.combatants.length === 0) return undefined;
  const ordered = order(encounter.combatants);
  return ordered[encounter.turn % ordered.length];
}

/** The 5e concentration DC: 10, or half the damage, whichever is higher. */
export const concentrationDc = (damage: number): number => Math.max(10, Math.floor(damage / 2));
