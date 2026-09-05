import type { ModuleEntity, SystemModule } from '@ttrpg/rules-engine';
import {
  ABILITIES,
  PROFICIENCY_BONUS,
  PROFICIENCY_SCALE,
  add,
  advantage,
  disadvantage,
  f,
  grant,
  noArmour,
  prof,
  abilityCapDerivations,
  abilityCapEffects,
  saveDerivations,
  set,
  skillDerivations,
  wearingArmour,
} from './authoring.js';
import { classes2014, subclasses2014 } from './srd/classes-2014.js';
import { species2014 } from './srd/species-2014.js';

/**
 * D&D 5e (2014) — SRD 5.1, CC-BY-4.0.
 *
 * A vertical slice: enough content to exercise every mechanical shape and to
 * build Phases 3-5 against. Bulk SRD ingestion backfills later without
 * changing anything structural.
 *
 * This module and `dnd5e-2024` share no rules code — only the authoring
 * helpers, which build ordinary engine primitives. That independence is the
 * point: two modules encoding genuinely different rules through one engine is
 * what proves the engine is general.
 */

const backgrounds: ModuleEntity[] = [
  {
    key: 'sage',
    type: 'background',
    name: 'Sage',
    grants: [
      {
        effects: [prof('skill.arcana', 'proficient'), prof('skill.history', 'proficient')],
      },
    ],
  },
  {
    key: 'soldier',
    type: 'background',
    name: 'Soldier',
    grants: [
      {
        effects: [prof('skill.athletics', 'proficient'), prof('skill.intimidation', 'proficient')],
      },
    ],
  },
];

const fightingStyles: ModuleEntity[] = [
  {
    key: 'style-defense',
    type: 'feat',
    name: 'Defense fighting style',
    // Conditional on wearing armour, which is exactly the kind of gate that
    // must stay visible in the trace when it fails.
    grants: [{ effects: [add('ac', 1)], when: wearingArmour(), detail: 'wearing armor' }],
  },
  {
    key: 'style-dueling',
    type: 'feat',
    name: 'Dueling fighting style',
    grants: [{ effects: [add('damage.melee', 2)], detail: 'one-handed melee weapon' }],
  },
];

const items: ModuleEntity[] = [
  {
    key: 'leather-armour',
    type: 'item',
    name: 'Leather Armor',
    data: { category: 'light', ac: 11 },
    grants: [{ effects: [set('ac', '11 + attr.dex.mod'), grant('state', 'armour.light')] }],
  },
  {
    key: 'studded-leather',
    type: 'item',
    name: 'Studded Leather',
    data: { category: 'light', ac: 12 },
    grants: [{ effects: [set('ac', '12 + attr.dex.mod'), grant('state', 'armour.light')] }],
  },
  {
    key: 'chain-mail',
    type: 'item',
    name: 'Chain Mail',
    data: { category: 'heavy', ac: 16, strengthRequirement: 13 },
    grants: [
      { effects: [set('ac', 16), grant('state', 'armour.heavy')] },
      {
        // Only the penalty is conditional. Repeating the AC and state grant
        // here would emit each of them twice for a low-Strength wearer.
        effects: [add('speed', -10)],
        when: { kind: 'expression', formula: f('attr.str.score < 13') },
        detail: 'Strength below 13',
      },
    ],
  },
  {
    key: 'shield',
    type: 'item',
    name: 'Shield',
    grants: [{ effects: [add('ac', 2), grant('state', 'shield')] }],
  },
  {
    key: 'ring-of-protection',
    type: 'item',
    name: 'Ring of Protection',
    data: { rarity: 'rare', attunement: true },
    grants: [
      {
        effects: [add('ac', 1, 'deflection'), add('save.all', 1, 'deflection')],
        detail: 'attuned',
      },
    ],
  },
  {
    key: 'longsword',
    type: 'item',
    name: 'Longsword',
    data: { damage: '1d8', versatile: '1d10', properties: ['versatile'] },
    grants: [{ effects: [grant('attack', 'longsword', { ability: 'str', damage: '1d8' })] }],
  },
];

const spells: ModuleEntity[] = [
  {
    key: 'mage-armour',
    type: 'power',
    name: 'Mage Armor',
    data: { level: 1, school: 'abjuration', duration: '8 hours' },
    // A competing base AC calculation. It wins over leather but loses to plate,
    // and neither needs to know the other exists.
    grants: [{ effects: [set('ac', '13 + attr.dex.mod')], when: noArmour, detail: 'no armor' }],
  },
  {
    key: 'shield-spell',
    type: 'power',
    name: 'Shield',
    data: { level: 1, school: 'abjuration', castingTime: 'reaction' },
    grants: [
      { effects: [add('ac', 5)], when: { kind: 'flag', flag: 'shield-spell' }, detail: 'reaction' },
    ],
  },
  {
    key: 'bless',
    type: 'power',
    name: 'Bless',
    data: { level: 1, school: 'enchantment', concentration: true },
    grants: [
      {
        effects: [add('attack.bonus', 2.5), add('save.all', 2.5)],
        when: { kind: 'flag', flag: 'blessed' },
        detail: 'average of 1d4',
      },
    ],
  },
  {
    key: 'fireball',
    type: 'power',
    name: 'Fireball',
    data: { level: 3, school: 'evocation', damage: '8d6', save: 'dex', range: 150 },
  },
  {
    key: 'haste',
    type: 'power',
    name: 'Haste',
    data: { level: 3, school: 'transmutation', concentration: true },
    grants: [
      {
        effects: [add('ac', 2), add('attacks', 1), add('save.dex', 'attr.dex.mod')],
        when: { kind: 'flag', flag: 'hasted' },
      },
    ],
  },
];

const conditions: ModuleEntity[] = [
  {
    key: 'prone',
    type: 'condition',
    name: 'Prone',
    grants: [
      {
        effects: [disadvantage('attack'), advantage('attacked.melee')],
        when: { kind: 'flag', flag: 'prone' },
      },
    ],
  },
  {
    key: 'poisoned',
    type: 'condition',
    name: 'Poisoned',
    grants: [
      {
        effects: [disadvantage('attack'), disadvantage('ability_check')],
        when: { kind: 'flag', flag: 'poisoned' },
      },
    ],
  },
  {
    key: 'exhaustion-1',
    type: 'condition',
    name: 'Exhaustion (level 1)',
    // 2014 exhaustion is a ladder of distinct effects per level. 2024 replaced
    // it with a flat, cumulative penalty — see the 2024 module.
    grants: [
      {
        effects: [disadvantage('ability_check')],
        when: { kind: 'flag', flag: 'exhaustion.1' },
      },
    ],
  },
];

export const dnd5e2014: SystemModule = {
  id: 'dnd5e-2014',
  name: 'D&D 5e (2014)',
  source: {
    id: 'srd-5-1',
    name: 'System Reference Document 5.1',
    license: 'CC-BY-4.0',
  },
  attributes: [...ABILITIES],
  proficiencyScale: PROFICIENCY_SCALE,
  // Ability score maxima hold for everyone, taken or not.
  rules: abilityCapEffects(),
  derived: [
    {
      key: 'proficiency_bonus',
      name: 'Proficiency Bonus',
      formula: PROFICIENCY_BONUS,
      display: { signed: true },
    },
    { key: 'speed', name: 'Speed', base: 30, display: { suffix: 'ft' } },
    { key: 'hp.max', name: 'Hit Points', base: 0 },
    {
      key: 'initiative',
      name: 'Initiative',
      formula: 'attr.dex.mod',
      display: { signed: true },
    },
    { key: 'ac', name: 'Armor Class', formula: '10 + attr.dex.mod' },
    { key: 'attacks', name: 'Attacks per Action', base: 0 },
    { key: 'crit.range', name: 'Critical Range', base: 20, display: { suffix: '+' } },
    { key: 'passive.perception', name: 'Passive Perception', formula: '10 + skill.perception' },
    // Declared so they reach the sheet. A stat that only ever exists because an
    // effect targeted it computes correctly but renders nowhere.
    { key: 'spell.attack', name: 'Spell Attack', base: 0, display: { signed: true } },
    { key: 'spell.save_dc', name: 'Spell Save DC', base: 0 },
    { key: 'spell.prepared_max', name: 'Spells Prepared', base: 0 },
    { key: 'spell.known_max', name: 'Spells Known', base: 0 },
    { key: 'ki.save_dc', name: 'Ki Save DC', base: 0 },
    { key: 'sneak_attack.dice', name: 'Sneak Attack Dice', base: 0, display: { suffix: 'd6' } },
    { key: 'attack.bonus', name: 'Attack Bonus', base: 0, display: { signed: true } },
    { key: 'damage.melee', name: 'Melee Damage', base: 0, display: { signed: true } },
    ...abilityCapDerivations(),
    ...saveDerivations(),
    ...skillDerivations(),
  ],
  entities: [
    ...species2014,
    ...backgrounds,
    ...classes2014,
    ...subclasses2014,
    ...fightingStyles,
    ...items,
    ...spells,
    ...conditions,
  ],
};
