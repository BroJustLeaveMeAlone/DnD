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
  pool,
  prof,
  resist,
  saveDerivations,
  sense,
  set,
  skillDerivations,
  wearingArmour,
} from './authoring.js';

/**
 * D&D 5e (2024) — SRD 5.2.1, CC-BY-4.0.
 *
 * Encoded independently of `dnd5e-2014`. The two share authoring helpers and
 * nothing else, which is deliberate: the differences below are exactly the
 * places where a shortcut would have quietly coupled them.
 *
 * Where 2024 genuinely diverges:
 *
 *  - Species grant no ability score increases. Backgrounds do, along with a
 *    feat. This is the single largest structural change between editions.
 *  - Weapon mastery properties exist and are gated on class features.
 *  - Exhaustion is a flat cumulative -2 to d20 tests, not a six-rung ladder of
 *    distinct effects.
 *  - Every class takes its subclass at level 3.
 *  - Wizards prepare from a fixed table rather than INT + level.
 *  - Heroic Inspiration replaces Inspiration.
 */

const species: ModuleEntity[] = [
  {
    key: 'human',
    type: 'species',
    name: 'Human',
    // No ability score increases. Compare the 2014 human, which raises all six.
    grants: [
      {
        effects: [
          set('speed', 30),
          grant('trait', 'resourceful', { gain: 'heroic-inspiration-on-long-rest' }),
          grant('trait', 'skillful'),
          grant('feat-choice', 'origin-feat'),
        ],
      },
    ],
  },
  {
    key: 'elf',
    type: 'species',
    name: 'Elf',
    grants: [
      {
        effects: [
          set('speed', 30),
          sense('darkvision', 60),
          prof('skill.perception', 'proficient'),
          advantage('save.charmed'),
          grant('trait', 'fey-ancestry'),
          grant('trait', 'trance'),
          grant('choice', 'elven-lineage'),
        ],
      },
    ],
  },
  {
    key: 'dwarf',
    type: 'species',
    name: 'Dwarf',
    grants: [
      {
        effects: [
          set('speed', 30), // 2024 raised dwarf speed from 25 to 30.
          sense('darkvision', 120), // and darkvision from 60 to 120.
          resist('poison'),
          advantage('save.poisoned'),
          grant('trait', 'dwarven-toughness'),
          add('hp.max', 'level'),
          grant('trait', 'stonecunning'),
        ],
      },
    ],
  },
];

/**
 * 2024 backgrounds carry the ability score increases and an origin feat. In
 * 2014 they carried neither.
 */
const backgrounds: ModuleEntity[] = [
  {
    key: 'sage',
    type: 'background',
    name: 'Sage',
    data: { abilities: ['con', 'int', 'wis'], feat: 'magic-initiate' },
    grants: [
      {
        effects: [
          add('attr.int.score', 2),
          add('attr.con.score', 1),
          prof('skill.arcana', 'proficient'),
          prof('skill.history', 'proficient'),
          grant('feat', 'magic-initiate'),
        ],
      },
    ],
  },
  {
    key: 'soldier',
    type: 'background',
    name: 'Soldier',
    data: { abilities: ['str', 'dex', 'con'], feat: 'savage-attacker' },
    grants: [
      {
        effects: [
          add('attr.str.score', 2),
          add('attr.con.score', 1),
          prof('skill.athletics', 'proficient'),
          prof('skill.intimidation', 'proficient'),
          grant('feat', 'savage-attacker'),
        ],
      },
    ],
  },
];

const classes: ModuleEntity[] = [
  {
    key: 'fighter',
    type: 'class',
    name: 'Fighter',
    data: { hitDie: 10, primary: 'str' },
    grants: [
      {
        effects: [
          add('hp.max', '10 + attr.con.mod + (level.fighter - 1) * (6 + attr.con.mod)'),
          prof('save.str', 'proficient'),
          prof('save.con', 'proficient'),
          set('attacks', 1),
          grant('proficiency', 'armour.all'),
          grant('proficiency', 'weapon.martial'),
          // Weapon Mastery is new in 2024, and the count scales with level.
          set('weapon_mastery.count', 3),
        ],
      },
      // Second Wind gains uses with level rather than staying at one.
      { atLevel: 1, effects: [pool('second-wind', 2, 'short-rest')] },
      { atLevel: 4, effects: [pool('second-wind', 3, 'short-rest')] },
      { atLevel: 2, effects: [pool('action-surge', 1, 'short-rest')] },
      { atLevel: 3, effects: [grant('choice', 'subclass')] },
      { atLevel: 4, effects: [add('weapon_mastery.count', 1)] },
      { atLevel: 5, effects: [add('attacks', 1)] },
      { atLevel: 9, effects: [pool('tactical-mind', 1, 'short-rest')] },
      { atLevel: 11, effects: [add('attacks', 1)] },
      { atLevel: 20, effects: [add('attacks', 1)] },
    ],
  },
  {
    key: 'wizard',
    type: 'class',
    name: 'Wizard',
    data: { hitDie: 6, primary: 'int' },
    grants: [
      {
        effects: [
          add('hp.max', '6 + attr.con.mod + (level.wizard - 1) * (4 + attr.con.mod)'),
          prof('save.int', 'proficient'),
          prof('save.wis', 'proficient'),
          set('spell.attack', 'attr.int.mod + proficiency_bonus'),
          set('spell.save_dc', '8 + attr.int.mod + proficiency_bonus'),
          // A fixed table, not INT + level as in 2014.
          set('spell.prepared_max', '3 + level.wizard'),
          grant('casting', 'arcane', { ability: 'int', preparation: 'prepared' }),
        ],
      },
      { atLevel: 1, effects: [pool('spell_slot.1', 2, 'long-rest', 1)] },
      { atLevel: 3, effects: [pool('spell_slot.2', 2, 'long-rest', 2)] },
      { atLevel: 3, effects: [grant('choice', 'subclass')] },
      { atLevel: 5, effects: [pool('spell_slot.3', 2, 'long-rest', 3)] },
      { atLevel: 7, effects: [pool('spell_slot.4', 1, 'long-rest', 4)] },
      { atLevel: 9, effects: [pool('spell_slot.5', 1, 'long-rest', 5)] },
    ],
  },
];

const subclasses: ModuleEntity[] = [
  {
    key: 'fighter-champion',
    type: 'subclass',
    name: 'Champion',
    // Level 3, not 3-for-fighters-7-for-others. Every 2024 class is uniform.
    grants: [
      { atLevel: 3, effects: [set('crit.range', 19), grant('feature', 'remarkable-athlete')] },
      { atLevel: 3, effects: [add('initiative', 'proficiency_bonus')] },
    ],
  },
  {
    key: 'wizard-evocation',
    type: 'subclass',
    name: 'Evoker',
    grants: [{ atLevel: 3, effects: [grant('feature', 'potent-cantrip')] }],
  },
];

const feats: ModuleEntity[] = [
  {
    key: 'style-defense',
    type: 'feat',
    name: 'Defense fighting style',
    grants: [{ effects: [add('ac', 1)], when: wearingArmour(), detail: 'wearing armor' }],
  },
  {
    key: 'savage-attacker',
    type: 'feat',
    name: 'Savage Attacker',
    data: { origin: true },
    grants: [{ effects: [grant('feature', 'reroll-weapon-damage')] }],
  },
  {
    key: 'magic-initiate',
    type: 'feat',
    name: 'Magic Initiate',
    data: { origin: true },
    grants: [{ effects: [grant('casting', 'initiate', { cantrips: 2, spells: 1 })] }],
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
        // Only the penalty is conditional — see the 2014 module for why.
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
    // Weapon mastery property — 2024 only.
    data: { damage: '1d8', versatile: '1d10', mastery: 'sap', properties: ['versatile'] },
    grants: [
      {
        effects: [grant('attack', 'longsword', { ability: 'str', damage: '1d8', mastery: 'sap' })],
      },
    ],
  },
];

const spells: ModuleEntity[] = [
  {
    key: 'mage-armour',
    type: 'power',
    name: 'Mage Armor',
    data: { level: 1, school: 'abjuration', duration: '8 hours' },
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
        effects: [add('ac', 2), add('save.dex', 'attr.dex.mod')],
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
    key: 'exhaustion',
    type: 'condition',
    name: 'Exhaustion',
    // One flat, scaling penalty. 2014 needed six separate condition entities
    // with qualitatively different effects at each rung.
    grants: [
      {
        effects: [add('d20_test', '-2 * exhaustion.level'), add('speed', '-5 * exhaustion.level')],
        when: { kind: 'expression', formula: f('exhaustion.level > 0') },
        detail: 'per level of exhaustion',
      },
    ],
  },
];

export const dnd5e2024: SystemModule = {
  id: 'dnd5e-2024',
  name: 'D&D 5e (2024)',
  source: {
    id: 'srd-5-2-1',
    name: 'System Reference Document 5.2.1',
    license: 'CC-BY-4.0',
  },
  attributes: [...ABILITIES],
  proficiencyScale: PROFICIENCY_SCALE,
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
    { key: 'weapon_mastery.count', name: 'Weapon Masteries', base: 0 },
    { key: 'd20_test', name: 'D20 Test Modifier', base: 0 },
    { key: 'passive.perception', name: 'Passive Perception', formula: '10 + skill.perception' },
    ...saveDerivations(),
    ...skillDerivations(),
  ],
  entities: [
    ...species,
    ...backgrounds,
    ...classes,
    ...subclasses,
    ...feats,
    ...items,
    ...spells,
    ...conditions,
  ],
};
