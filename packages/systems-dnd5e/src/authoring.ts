import { type Effect, Formula, type Predicate, flag } from '@ttrpg/rules-engine';

/**
 * Ergonomics only. These build ordinary engine primitives — nothing here grants
 * the 5e modules a capability the System Designer will not also have. If a
 * helper ever needs to reach past the public engine API, the module has stopped
 * being data and the architecture has slipped.
 */

export const f = (value: string | number) => Formula.parse(String(value));

export const add = (target: string, value: string | number, bonusType?: string): Effect => ({
  kind: 'numeric',
  target,
  operation: 'add',
  value: f(value),
  ...(bonusType !== undefined ? { bonusType } : {}),
});

export const set = (target: string, value: string | number): Effect => ({
  kind: 'numeric',
  target,
  operation: 'set',
  value: f(value),
});

export const floorAt = (target: string, value: string | number): Effect => ({
  kind: 'numeric',
  target,
  operation: 'floor',
  value: f(value),
});

export const capAt = (target: string, value: string | number): Effect => ({
  kind: 'numeric',
  target,
  operation: 'cap',
  value: f(value),
});

export const prof = (target: string, level: 'half' | 'proficient' | 'expertise'): Effect => ({
  kind: 'proficiency',
  target,
  level,
});

export const advantage = (target: string): Effect => ({
  kind: 'roll-bias',
  target,
  bias: 'advantage',
});

export const disadvantage = (target: string): Effect => ({
  kind: 'roll-bias',
  target,
  bias: 'disadvantage',
});

export const resist = (target: string): Effect => ({
  kind: 'damage-response',
  target,
  response: 'resistance',
});

export const immune = (target: string): Effect => ({
  kind: 'damage-response',
  target,
  response: 'immunity',
});

export const pool = (
  target: string,
  max: string | number,
  recharge: 'short-rest' | 'long-rest' | 'dawn' | 'encounter' | 'turn' | 'never',
  tier?: number,
): Effect => ({
  kind: 'resource',
  target,
  max: f(max),
  recharge,
  ...(tier !== undefined ? { tier } : {}),
});

export const grant = (
  category: string,
  target: string,
  data?: Readonly<Record<string, unknown>>,
): Effect => ({
  kind: 'grant',
  category,
  target,
  ...(data !== undefined ? { data } : {}),
});

export const sense = (target: string, range: number): Effect => grant('sense', target, { range });

/** True while the character wears armour of the given category, or any at all. */
export const wearingArmour = (category?: 'light' | 'medium' | 'heavy'): Predicate =>
  flag(category ? `armour.${category}` : 'armour.any');

export const noArmour: Predicate = { kind: 'not', of: flag('armour.any') };
export const noShield: Predicate = { kind: 'not', of: flag('shield') };

/** The 5e proficiency bonus curve, as a formula rather than a lookup table. */
export const PROFICIENCY_BONUS = 'floor((level - 1) / 4) + 2';

/**
 * Ability score to modifier, over the *resolved* score — so increases from a
 * species or background are already stacked in by the time this evaluates.
 */
export const abilityModifier = (key: string) => `floor((attr.${key}.score - 10) / 2)`;

const ability = (key: string, name: string, abbreviation: string) => ({
  key,
  name,
  abbreviation,
  modifier: abilityModifier(key),
  default: 10,
});

export const ABILITIES = [
  ability('str', 'Strength', 'STR'),
  ability('dex', 'Dexterity', 'DEX'),
  ability('con', 'Constitution', 'CON'),
  ability('int', 'Intelligence', 'INT'),
  ability('wis', 'Wisdom', 'WIS'),
  ability('cha', 'Charisma', 'CHA'),
];

/**
 * Skill key to its governing ability. Identical across both editions.
 *
 * Underscores, not hyphens: these become formula path segments, and `-` is not
 * an identifier character in the DSL (it would make `level-1` ambiguous).
 */
export const SKILLS: Readonly<Record<string, string>> = {
  acrobatics: 'dex',
  animal_handling: 'wis',
  arcana: 'int',
  athletics: 'str',
  deception: 'cha',
  history: 'int',
  insight: 'wis',
  intimidation: 'cha',
  investigation: 'int',
  medicine: 'wis',
  nature: 'int',
  perception: 'wis',
  performance: 'cha',
  persuasion: 'cha',
  religion: 'wis',
  sleight_of_hand: 'dex',
  stealth: 'dex',
  survival: 'wis',
};

/**
 * Skill and save totals as derived stats.
 *
 * `prof.<key>` is a fact the sheet layer supplies from resolved proficiency
 * levels — expressing the multiplier as data keeps half-proficiency and
 * expertise out of the engine, where they would be a 5e-ism.
 */
export const skillDerivations = () =>
  Object.entries(SKILLS).map(([skill, ability]) => ({
    key: `skill.${skill}`,
    name: skill.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()),
    formula: `attr.${ability}.mod + prof.skill.${skill} * proficiency_bonus`,
  }));

/**
 * `save.all` is a channel for effects that bonus every save at once — a Ring of
 * Protection, Bless, Aura of Protection. Each save reads it rather than every
 * such item having to emit six separate effects.
 *
 * It is declared with `base: 0` and returned from here rather than left to each
 * module, because a formula referencing an undefined path resolves to nothing
 * and breaks the stat that reads it. Most characters own no all-saves item, so
 * omitting the declaration breaks the common case, not the exotic one.
 */
export const saveDerivations = () => [
  { key: 'save.all', name: 'All Saves', base: 0 },
  ...ABILITIES.map((ability) => ({
    key: `save.${ability.key}`,
    name: `${ability.name} save`,
    formula: `attr.${ability.key}.mod + prof.save.${ability.key} * proficiency_bonus + save.all`,
  })),
];
