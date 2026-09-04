import { describe, expect, it } from 'vitest';
import {
  type CombatantState,
  type EncounterLike,
  activeCombatant,
  addCondition,
  applyDamage,
  applyHealing,
  concentrationDc,
  grantTemporaryHitPoints,
  nextTurn,
  recordDeathSave,
  removeCondition,
  setConcentration,
  startEncounter,
} from './combat.js';

const now = () => '2026-01-01T00:00:00.000Z';
const opts = { now };

const combatant = (
  over: Partial<CombatantState> & { id: string; name: string },
): CombatantState => ({
  initiative: 10,
  tiebreak: 0.5,
  hp: { current: 20, max: 20, temporary: 0 },
  conditions: [],
  concentratingOn: null,
  deathSaves: { successes: 0, failures: 0 },
  defeated: false,
  ...over,
});

const encounter = (combatants: CombatantState[]): EncounterLike => ({
  round: 0,
  turn: 0,
  started: false,
  combatants,
  log: [],
});

const hero = () => combatant({ id: 'a', name: 'Hero', initiative: 18 });
const brute = () => combatant({ id: 'b', name: 'Brute', initiative: 12 });

describe('damage', () => {
  it('reduces current hit points', () => {
    const result = applyDamage(encounter([hero()]), 'a', 7, opts);
    expect(result.encounter.combatants[0]!.hp.current).toBe(13);
    expect(result.applied).toBe(7);
  });

  it('spends temporary hit points first', () => {
    // Temporary HP is a separate pool absorbing damage before it reaches you.
    // Treating it as extra current HP silently inflates effective health.
    const target = combatant({ id: 'a', name: 'Hero', hp: { current: 20, max: 20, temporary: 5 } });
    const result = applyDamage(encounter([target]), 'a', 8, opts);

    expect(result.absorbedByTemporary).toBe(5);
    expect(result.applied).toBe(3);
    expect(result.encounter.combatants[0]!.hp.current).toBe(17);
    expect(result.encounter.combatants[0]!.hp.temporary).toBe(0);
  });

  it('leaves current hit points untouched when temporary absorbs everything', () => {
    const target = combatant({ id: 'a', name: 'Hero', hp: { current: 20, max: 20, temporary: 9 } });
    const result = applyDamage(encounter([target]), 'a', 4, opts);
    expect(result.encounter.combatants[0]!.hp.current).toBe(20);
    expect(result.encounter.combatants[0]!.hp.temporary).toBe(5);
  });

  it('reports dropping to zero, once', () => {
    const first = applyDamage(encounter([hero()]), 'a', 25, opts);
    expect(first.droppedToZero).toBe(true);

    // Already down: further damage must not re-report the drop.
    const second = applyDamage(first.encounter, 'a', 5, opts);
    expect(second.droppedToZero).toBe(false);
  });

  it('ends concentration outright at zero, with no save offered', () => {
    const caster = combatant({ id: 'a', name: 'Caster', concentratingOn: 'Bless' });
    const result = applyDamage(encounter([caster]), 'a', 50, opts);
    expect(result.encounter.combatants[0]!.concentratingOn).toBeNull();
    expect(result.concentrationAtRisk).toBe(false);
  });

  it('flags a concentration check above the threshold', () => {
    const caster = combatant({ id: 'a', name: 'Caster', concentratingOn: 'Bless' });
    const state = encounter([caster]);

    expect(
      applyDamage(state, 'a', 9, { ...opts, concentrationThreshold: 10 }).concentrationAtRisk,
    ).toBe(false);
    expect(
      applyDamage(state, 'a', 10, { ...opts, concentrationThreshold: 10 }).concentrationAtRisk,
    ).toBe(true);
  });

  it('never flags concentration for a system that has none', () => {
    const caster = combatant({ id: 'a', name: 'Caster', concentratingOn: 'Domain' });
    const result = applyDamage(encounter([caster]), 'a', 99, {
      ...opts,
      concentrationThreshold: null,
    });
    expect(result.concentrationAtRisk).toBe(false);
  });

  it('ignores non-positive damage and unknown targets', () => {
    const state = encounter([hero()]);
    expect(applyDamage(state, 'a', 0, opts).encounter).toBe(state);
    expect(applyDamage(state, 'ghost', 5, opts).encounter).toBe(state);
  });

  it('computes the 5e concentration DC', () => {
    expect(concentrationDc(7)).toBe(10);
    expect(concentrationDc(30)).toBe(15);
    expect(concentrationDc(21)).toBe(10);
  });
});

describe('healing', () => {
  it('does not exceed maximum hit points', () => {
    const wounded = combatant({
      id: 'a',
      name: 'Hero',
      hp: { current: 18, max: 20, temporary: 0 },
    });
    expect(applyHealing(encounter([wounded]), 'a', 10, opts).combatants[0]!.hp.current).toBe(20);
  });

  it('revives from negative hit points to the healed amount, not from the deficit', () => {
    const down = combatant({ id: 'a', name: 'Hero', hp: { current: -6, max: 20, temporary: 0 } });
    // Healing 5 must give 5, not -1.
    expect(applyHealing(encounter([down]), 'a', 5, opts).combatants[0]!.hp.current).toBe(5);
  });

  it('clears death saves and defeat when revived', () => {
    const down = combatant({
      id: 'a',
      name: 'Hero',
      hp: { current: 0, max: 20, temporary: 0 },
      deathSaves: { successes: 1, failures: 2 },
      defeated: true,
    });
    const healed = applyHealing(encounter([down]), 'a', 3, opts).combatants[0]!;
    expect(healed.deathSaves).toEqual({ successes: 0, failures: 0 });
    expect(healed.defeated).toBe(false);
  });

  it('temporary hit points replace rather than stack', () => {
    let state = grantTemporaryHitPoints(encounter([hero()]), 'a', 5);
    state = grantTemporaryHitPoints(state, 'a', 3);
    expect(state.combatants[0]!.hp.temporary).toBe(5);

    state = grantTemporaryHitPoints(state, 'a', 9);
    expect(state.combatants[0]!.hp.temporary).toBe(9);
  });
});

describe('conditions', () => {
  it('adds and removes', () => {
    let state = addCondition(encounter([hero()]), 'a', { key: 'prone' }, opts);
    expect(state.combatants[0]!.conditions.map((c) => c.key)).toEqual(['prone']);

    state = removeCondition(state, 'a', 'prone');
    expect(state.combatants[0]!.conditions).toEqual([]);
  });

  it('refreshes duration instead of stacking a duplicate', () => {
    let state = addCondition(encounter([hero()]), 'a', { key: 'poisoned', rounds: 2 }, opts);
    state = addCondition(state, 'a', { key: 'poisoned', rounds: 5 }, opts);

    expect(state.combatants[0]!.conditions).toHaveLength(1);
    expect(state.combatants[0]!.conditions[0]!.rounds).toBe(5);
  });
});

describe('turn order', () => {
  it('sorts by initiative, highest first', () => {
    const state = startEncounter(encounter([brute(), hero()]), opts);
    expect(activeCombatant(state)?.name).toBe('Hero');
  });

  it('breaks ties with the stored tiebreak, not a re-roll', () => {
    // Re-deriving ties each render would reorder the list mid-combat.
    const a = combatant({ id: 'a', name: 'A', initiative: 15, tiebreak: 0.2 });
    const b = combatant({ id: 'b', name: 'B', initiative: 15, tiebreak: 0.9 });
    const state = startEncounter(encounter([a, b]), opts);
    expect(activeCombatant(state)?.name).toBe('B');
  });

  it('advances and wraps into the next round', () => {
    let state = startEncounter(encounter([hero(), brute()]), opts);
    expect(state.round).toBe(1);

    state = nextTurn(state, opts).encounter;
    expect(activeCombatant(state)?.name).toBe('Brute');
    expect(state.round).toBe(1);

    state = nextTurn(state, opts).encounter;
    expect(activeCombatant(state)?.name).toBe('Hero');
    expect(state.round).toBe(2);
  });

  it('ticks conditions at the end of the affected combatant’s turn', () => {
    // Not at the end of the round — that would make "1 round" mean different
    // lengths depending on initiative.
    //
    // The realistic case: Brute afflicts Hero on Brute's turn. Hero then gets a
    // full turn under the condition, and it falls off when that turn ends.
    let state = startEncounter(encounter([hero(), brute()]), opts);

    // Hero acts first, then it is Brute's turn.
    state = nextTurn(state, opts).encounter;
    expect(activeCombatant(state)?.name).toBe('Brute');

    state = addCondition(state, 'a', { key: 'dazed', rounds: 1 }, opts);

    // Brute's turn ends. Hero is unaffected by that tick.
    const afterBrute = nextTurn(state, opts);
    expect(afterBrute.expired).toEqual([]);
    expect(afterBrute.encounter.combatants[0]!.conditions).toHaveLength(1);

    // Hero takes a turn under the condition; ending it expires the condition.
    const afterHero = nextTurn(afterBrute.encounter, opts);
    expect(afterHero.expired).toEqual([{ combatant: 'Hero', condition: 'dazed' }]);
    expect(afterHero.encounter.combatants[0]!.conditions).toEqual([]);
  });

  it('expires immediately when applied during the target’s own turn', () => {
    // A one-round condition applied on your own turn ends when that turn does.
    // Documented rather than special-cased: to survive your next turn, give it
    // 2 rounds. Anything cleverer needs to record which turn it was applied on.
    let state = startEncounter(encounter([hero(), brute()]), opts);
    state = addCondition(state, 'a', { key: 'dazed', rounds: 1 }, opts);

    const result = nextTurn(state, opts);
    expect(result.expired).toEqual([{ combatant: 'Hero', condition: 'dazed' }]);
  });

  it('leaves open-ended conditions alone forever', () => {
    let state = startEncounter(encounter([hero()]), opts);
    state = addCondition(state, 'a', { key: 'cursed', rounds: null }, opts);

    for (let i = 0; i < 10; i += 1) state = nextTurn(state, opts).encounter;
    expect(state.combatants[0]!.conditions.map((c) => c.key)).toEqual(['cursed']);
  });

  it('does nothing before combat starts', () => {
    const state = encounter([hero()]);
    expect(nextTurn(state, opts).encounter).toBe(state);
    expect(activeCombatant(state)).toBeUndefined();
  });

  it('refuses to start an empty encounter', () => {
    const empty = encounter([]);
    expect(startEncounter(empty, opts)).toBe(empty);
  });
});

describe('death saves', () => {
  it('stabilises on three successes', () => {
    let state = encounter([
      combatant({ id: 'a', name: 'Hero', hp: { current: 0, max: 20, temporary: 0 } }),
    ]);
    for (let i = 0; i < 3; i += 1) state = recordDeathSave(state, 'a', true, opts);

    expect(state.combatants[0]!.deathSaves.successes).toBe(3);
    expect(state.combatants[0]!.defeated).toBe(false);
    expect(state.log.some((l) => l.message.includes('stabilises'))).toBe(true);
  });

  it('dies on three failures', () => {
    let state = encounter([
      combatant({ id: 'a', name: 'Hero', hp: { current: 0, max: 20, temporary: 0 } }),
    ]);
    for (let i = 0; i < 3; i += 1) state = recordDeathSave(state, 'a', false, opts);

    expect(state.combatants[0]!.defeated).toBe(true);
    expect(state.log.some((l) => l.message.includes('dies'))).toBe(true);
  });

  it('does not exceed three either way', () => {
    let state = encounter([
      combatant({ id: 'a', name: 'Hero', hp: { current: 0, max: 20, temporary: 0 } }),
    ]);
    for (let i = 0; i < 6; i += 1) state = recordDeathSave(state, 'a', true, opts);
    expect(state.combatants[0]!.deathSaves.successes).toBe(3);
  });
});

describe('purity', () => {
  it('never mutates the input', () => {
    const original = encounter([hero()]);
    const snapshot = JSON.stringify(original);

    applyDamage(original, 'a', 5, opts);
    applyHealing(original, 'a', 5, opts);
    addCondition(original, 'a', { key: 'prone' }, opts);
    setConcentration(original, 'a', 'Bless');
    nextTurn(startEncounter(original, opts), opts);

    expect(JSON.stringify(original)).toBe(snapshot);
  });

  it('is deterministic given the same inputs', () => {
    const state = startEncounter(encounter([hero(), brute()]), opts);
    expect(applyDamage(state, 'a', 7, opts)).toEqual(applyDamage(state, 'a', 7, opts));
  });
});
