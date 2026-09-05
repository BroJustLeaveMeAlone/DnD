import type { GrantSpec } from '@ttrpg/rules-engine';
import { pool } from '../authoring.js';

/**
 * Spellcasting progressions as tables.
 *
 * Twelve classes across twenty levels is 240 hand-written grants per edition,
 * and a transcription error in one of them is invisible until someone plays a
 * level 13 bard. Encoding the tables once and generating the grants makes the
 * data reviewable at a glance and wrong in one place rather than many.
 *
 * Each row is slots per spell level, index 0 being 1st-level slots.
 */

type SlotRow = readonly number[];

/** Bard, Cleric, Druid, Sorcerer, Wizard. SRD 5.1, Spellcasting tables. */
export const FULL_CASTER: readonly SlotRow[] = [
  [2], // 1
  [3], // 2
  [4, 2], // 3
  [4, 3], // 4
  [4, 3, 2], // 5
  [4, 3, 3], // 6
  [4, 3, 3, 1], // 7
  [4, 3, 3, 2], // 8
  [4, 3, 3, 3, 1], // 9
  [4, 3, 3, 3, 2], // 10
  [4, 3, 3, 3, 2, 1], // 11
  [4, 3, 3, 3, 2, 1], // 12
  [4, 3, 3, 3, 2, 1, 1], // 13
  [4, 3, 3, 3, 2, 1, 1], // 14
  [4, 3, 3, 3, 2, 1, 1, 1], // 15
  [4, 3, 3, 3, 2, 1, 1, 1], // 16
  [4, 3, 3, 3, 2, 1, 1, 1, 1], // 17
  [4, 3, 3, 3, 3, 1, 1, 1, 1], // 18
  [4, 3, 3, 3, 3, 2, 1, 1, 1], // 19
  [4, 3, 3, 3, 3, 2, 2, 1, 1], // 20
];

/** Paladin and Ranger. No slots at level 1. */
export const HALF_CASTER: readonly SlotRow[] = [
  [], // 1
  [2], // 2
  [3], // 3
  [3], // 4
  [4, 2], // 5
  [4, 2], // 6
  [4, 3], // 7
  [4, 3], // 8
  [4, 3, 2], // 9
  [4, 3, 2], // 10
  [4, 3, 3], // 11
  [4, 3, 3], // 12
  [4, 3, 3, 1], // 13
  [4, 3, 3, 1], // 14
  [4, 3, 3, 2], // 15
  [4, 3, 3, 2], // 16
  [4, 3, 3, 3, 1], // 17
  [4, 3, 3, 3, 1], // 18
  [4, 3, 3, 3, 2], // 19
  [4, 3, 3, 3, 2], // 20
];

/**
 * Warlock Pact Magic: a small number of slots, all at the same level, all
 * restored on a short rest. Structurally unlike every other caster, which is
 * why it gets its own table rather than a variant of the others.
 */
export const PACT_MAGIC: readonly { slots: number; level: number }[] = [
  { slots: 1, level: 1 }, // 1
  { slots: 2, level: 1 }, // 2
  { slots: 2, level: 2 }, // 3
  { slots: 2, level: 2 }, // 4
  { slots: 2, level: 3 }, // 5
  { slots: 2, level: 3 }, // 6
  { slots: 2, level: 4 }, // 7
  { slots: 2, level: 4 }, // 8
  { slots: 2, level: 5 }, // 9
  { slots: 2, level: 5 }, // 10
  { slots: 3, level: 5 }, // 11
  { slots: 3, level: 5 }, // 12
  { slots: 3, level: 5 }, // 13
  { slots: 3, level: 5 }, // 14
  { slots: 3, level: 5 }, // 15
  { slots: 3, level: 5 }, // 16
  { slots: 4, level: 5 }, // 17
  { slots: 4, level: 5 }, // 18
  { slots: 4, level: 5 }, // 19
  { slots: 4, level: 5 }, // 20
];

/**
 * Turns a slot table into grants.
 *
 * A grant is emitted only where the count *changes*, because the engine takes
 * the highest `set` for a target — emitting all twenty levels would be correct
 * but would bury the interesting rows in noise, and make the compendium page
 * for a class unreadable.
 */
export function slotGrants(table: readonly SlotRow[]): GrantSpec[] {
  const grants: GrantSpec[] = [];
  const previous = new Map<number, number>();

  table.forEach((row, index) => {
    const level = index + 1;
    row.forEach((count, slotIndex) => {
      const spellLevel = slotIndex + 1;
      if (previous.get(spellLevel) === count) return;
      previous.set(spellLevel, count);
      grants.push({
        atLevel: level,
        effects: [pool(`spell_slot.${spellLevel}`, count, 'long-rest', spellLevel)],
      });
    });
  });

  return grants;
}

export function pactGrants(table: readonly { slots: number; level: number }[]): GrantSpec[] {
  const grants: GrantSpec[] = [];
  let last = '';

  table.forEach((row, index) => {
    const key = `${row.slots}:${row.level}`;
    if (key === last) return;
    last = key;
    grants.push({
      atLevel: index + 1,
      effects: [
        // Short rest, not long — the defining feature of Pact Magic.
        pool('pact_slot', row.slots, 'short-rest', row.level),
      ],
    });
  });

  return grants;
}

/** Ability Score Improvement levels. Fighters and rogues get extras. */
export const ASI_LEVELS = [4, 8, 12, 16, 19];
export const FIGHTER_ASI_LEVELS = [4, 6, 8, 12, 14, 16, 19];
export const ROGUE_ASI_LEVELS = [4, 8, 10, 12, 16, 19];

export const asiGrants = (levels: readonly number[] = ASI_LEVELS): GrantSpec[] =>
  levels.map((atLevel) => ({
    atLevel,
    effects: [
      {
        kind: 'grant' as const,
        category: 'choice',
        target: 'ability-score-improvement',
        data: { level: atLevel },
      },
    ],
  }));

/** Rogue Sneak Attack: one d6 at level 1, another every odd level after. */
export const sneakAttackDice = (level: number): number => Math.ceil(level / 2);

/** Hit points: max at level 1, then the class average plus CON each level. */
export const hitPointFormula = (hitDie: number, classKey: string): string => {
  const average = Math.floor(hitDie / 2) + 1;
  return `${hitDie} + attr.con.mod + (level.${classKey} - 1) * (${average} + attr.con.mod)`;
};
