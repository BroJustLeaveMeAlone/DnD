import type { Formula } from './formula/index.js';
import { type Predicate, always } from './predicate.js';

/**
 * The effect vocabulary from PLAN.md §1.
 *
 * Nothing here names a 5e concept. `target` is an opaque string owned by the
 * system module: `dnd5e-2024` uses `ac` and `save.dex`, a custom world uses
 * `ward` and `resolve`, and the engine does not care which.
 */

/**
 * Named bonus category for stacking. Two bonuses sharing a type do not add —
 * the larger wins. An undefined type means untyped, and untyped bonuses stack
 * with everything including each other.
 */
export type BonusType = string;

export type NumericOperation = 'add' | 'set' | 'floor' | 'cap';

export interface NumericEffect {
  kind: 'numeric';
  /** Which derived stat this changes. */
  target: string;
  operation: NumericOperation;
  value: Formula;
  bonusType?: BonusType;
}

export type ProficiencyLevel = 'none' | 'half' | 'proficient' | 'expertise';

export const PROFICIENCY_RANK: Record<ProficiencyLevel, number> = {
  none: 0,
  half: 1,
  proficient: 2,
  expertise: 3,
};

export interface ProficiencyEffect {
  kind: 'proficiency';
  /** e.g. `skill.stealth`, `save.dex`, `tool.thieves-tools`. */
  target: string;
  level: ProficiencyLevel;
}

/** Advantage and disadvantage on a named roll category. */
export interface RollBiasEffect {
  kind: 'roll-bias';
  target: string;
  bias: 'advantage' | 'disadvantage';
}

export type DamageResponse = 'resistance' | 'immunity' | 'vulnerability';

export interface DamageResponseEffect {
  kind: 'damage-response';
  /** A damage type key defined by the system module. */
  target: string;
  response: DamageResponse;
}

/**
 * A pool: rage uses, ki, spell slots, cursed energy, mana. `tier` lets one
 * logical resource carry graded sub-pools, which is how spell slot levels work
 * without spell slots being a built-in concept.
 */
export interface ResourceEffect {
  kind: 'resource';
  target: string;
  max: Formula;
  recharge: 'short-rest' | 'long-rest' | 'dawn' | 'encounter' | 'turn' | 'never';
  tier?: number;
}

/** Grants something the character can do. Carried through for the sheet to render. */
export interface GrantEffect {
  kind: 'grant';
  /** `action`, `bonus-action`, `reaction`, `sense`, `movement`, `casting`, `choice`. */
  category: string;
  target: string;
  /** Category-specific payload. The engine passes it through untouched. */
  data?: Readonly<Record<string, unknown>>;
}

export type Effect =
  | NumericEffect
  | ProficiencyEffect
  | RollBiasEffect
  | DamageResponseEffect
  | ResourceEffect
  | GrantEffect;

/**
 * An effect bound to whatever produced it and whatever gates it.
 *
 * The source fields are not bookkeeping — they are the provenance trace, which
 * is a headline product feature and the engine's own test oracle. An effect
 * with no attributable source is a bug.
 */
export interface BoundEffect {
  effect: Effect;
  /** Stable id of the entity that granted this. */
  sourceId: string;
  /** Human-readable, shown directly in the trace: "Ring of Protection". */
  sourceName: string;
  /** Optional qualifier shown in brackets: "attuned", "wearing armour". */
  sourceDetail?: string;
  when: Predicate;
}

export function bind(
  effect: Effect,
  source: { id: string; name: string; detail?: string },
  when: Predicate = always,
): BoundEffect {
  return {
    effect,
    sourceId: source.id,
    sourceName: source.name,
    ...(source.detail !== undefined ? { sourceDetail: source.detail } : {}),
    when,
  };
}
