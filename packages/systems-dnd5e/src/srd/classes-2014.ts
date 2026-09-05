import type { ModuleEntity } from '@ttrpg/rules-engine';
import { add, grant, pool, prof, resist, set } from '../authoring.js';
import {
  FIGHTER_ASI_LEVELS,
  FULL_CASTER,
  HALF_CASTER,
  PACT_MAGIC,
  ROGUE_ASI_LEVELS,
  asiGrants,
  hitPointFormula,
  pactGrants,
  slotGrants,
} from './progressions.js';

/**
 * The twelve SRD 5.1 classes, levels 1–20.
 *
 * What is encoded here is what *calculates*: hit points, saves, proficiencies,
 * attacks, resources, and features whose effect a sheet can compute. Features
 * that are purely narrative or that require a decision at the table — Danger
 * Sense, Wild Shape's form library, Divine Intervention — are emitted as
 * `grant` entries so they appear on the sheet without pretending to be maths.
 *
 * Each class has exactly one subclass in the SRD. That is a licensing limit,
 * not a modelling one.
 */

const casting = (ability: string, preparation: 'prepared' | 'known') => [
  set('spell.attack', `attr.${ability}.mod + proficiency_bonus`),
  set('spell.save_dc', `8 + attr.${ability}.mod + proficiency_bonus`),
  grant('casting', 'spellcasting', { ability, preparation }),
];

export const classes2014: ModuleEntity[] = [
  {
    key: 'barbarian',
    type: 'class',
    name: 'Barbarian',
    data: { hitDie: 12, primary: 'str', saves: ['str', 'con'] },
    grants: [
      {
        effects: [
          add('hp.max', hitPointFormula(12, 'barbarian')),
          prof('save.str', 'proficient'),
          prof('save.con', 'proficient'),
          set('attacks', 1),
          grant('proficiency', 'armour.light'),
          grant('proficiency', 'armour.medium'),
          grant('proficiency', 'shield'),
          grant('proficiency', 'weapon.simple'),
          grant('proficiency', 'weapon.martial'),
        ],
      },
      // Unarmored Defense: a competing base AC calculation. It wins over light
      // armour for a high-CON barbarian and loses to plate, and neither needs
      // to know the other exists.
      {
        atLevel: 1,
        effects: [set('ac', '10 + attr.dex.mod + attr.con.mod')],
        when: { kind: 'not', of: { kind: 'flag', flag: 'armour.any' } },
        detail: 'Unarmored Defense',
      },
      { atLevel: 1, effects: [pool('rage', 2, 'long-rest'), grant('feature', 'rage')] },
      {
        atLevel: 2,
        effects: [grant('feature', 'reckless-attack'), grant('feature', 'danger-sense')],
      },
      { atLevel: 3, effects: [pool('rage', 3, 'long-rest')] },
      { atLevel: 5, effects: [add('attacks', 1), add('speed', 10)], detail: 'Fast Movement' },
      { atLevel: 6, effects: [pool('rage', 4, 'long-rest')] },
      { atLevel: 7, effects: [grant('feature', 'feral-instinct')] },
      { atLevel: 9, effects: [grant('feature', 'brutal-critical')] },
      { atLevel: 11, effects: [grant('feature', 'relentless-rage')] },
      { atLevel: 12, effects: [pool('rage', 5, 'long-rest')] },
      { atLevel: 17, effects: [pool('rage', 6, 'long-rest')] },
      {
        atLevel: 20,
        // Primal Champion raises the maximum as well as the score, so a
        // barbarian who was already at 20 actually gains from it.
        effects: [
          add('attr.str.score', 4),
          add('attr.con.score', 4),
          set('attr.str.cap', 24),
          set('attr.con.cap', 24),
        ],
        detail: 'Primal Champion',
      },
      ...asiGrants(),
      // Rage damage and resistance only while raging.
      {
        effects: [
          add('damage.melee', 2),
          resist('slashing'),
          resist('piercing'),
          resist('bludgeoning'),
        ],
        when: { kind: 'flag', flag: 'raging' },
        detail: 'while raging',
      },
      { atLevel: 9, effects: [add('damage.melee', 1)], when: { kind: 'flag', flag: 'raging' } },
      { atLevel: 16, effects: [add('damage.melee', 1)], when: { kind: 'flag', flag: 'raging' } },
    ],
  },

  {
    key: 'bard',
    type: 'class',
    name: 'Bard',
    data: { hitDie: 8, primary: 'cha', saves: ['dex', 'cha'] },
    grants: [
      {
        effects: [
          add('hp.max', hitPointFormula(8, 'bard')),
          prof('save.dex', 'proficient'),
          prof('save.cha', 'proficient'),
          set('attacks', 1),
          set('spell.known_max', '4 + level.bard'),
          ...casting('cha', 'known'),
          grant('proficiency', 'armour.light'),
          grant('proficiency', 'weapon.simple'),
        ],
      },
      {
        atLevel: 1,
        effects: [pool('bardic_inspiration', 'max(1, attr.cha.mod)', 'long-rest')],
      },
      {
        atLevel: 2,
        effects: [grant('feature', 'jack-of-all-trades'), grant('feature', 'song-of-rest')],
      },
      // Jack of All Trades is half proficiency on everything not already proficient.
      { atLevel: 3, effects: [grant('choice', 'expertise')] },
      {
        atLevel: 5,
        effects: [pool('bardic_inspiration', 'max(1, attr.cha.mod)', 'short-rest')],
        detail: 'Font of Inspiration',
      },
      { atLevel: 6, effects: [grant('feature', 'countercharm')] },
      { atLevel: 10, effects: [grant('choice', 'expertise'), grant('feature', 'magical-secrets')] },
      { atLevel: 20, effects: [grant('feature', 'superior-inspiration')] },
      ...asiGrants(),
      ...slotGrants(FULL_CASTER),
    ],
  },

  {
    key: 'cleric',
    type: 'class',
    name: 'Cleric',
    data: { hitDie: 8, primary: 'wis', saves: ['wis', 'cha'] },
    grants: [
      {
        effects: [
          add('hp.max', hitPointFormula(8, 'cleric')),
          prof('save.wis', 'proficient'),
          prof('save.cha', 'proficient'),
          set('attacks', 1),
          set('spell.prepared_max', 'max(1, attr.wis.mod + level.cleric)'),
          ...casting('wis', 'prepared'),
          grant('proficiency', 'armour.light'),
          grant('proficiency', 'armour.medium'),
          grant('proficiency', 'shield'),
          grant('proficiency', 'weapon.simple'),
        ],
      },
      { atLevel: 2, effects: [pool('channel_divinity', 1, 'short-rest')] },
      { atLevel: 5, effects: [grant('feature', 'destroy-undead')] },
      { atLevel: 6, effects: [pool('channel_divinity', 2, 'short-rest')] },
      { atLevel: 10, effects: [grant('feature', 'divine-intervention')] },
      { atLevel: 18, effects: [pool('channel_divinity', 3, 'short-rest')] },
      ...asiGrants(),
      ...slotGrants(FULL_CASTER),
    ],
  },

  {
    key: 'druid',
    type: 'class',
    name: 'Druid',
    data: { hitDie: 8, primary: 'wis', saves: ['int', 'wis'] },
    grants: [
      {
        effects: [
          add('hp.max', hitPointFormula(8, 'druid')),
          prof('save.int', 'proficient'),
          prof('save.wis', 'proficient'),
          set('attacks', 1),
          set('spell.prepared_max', 'max(1, attr.wis.mod + level.druid)'),
          ...casting('wis', 'prepared'),
          grant('proficiency', 'armour.light'),
          grant('proficiency', 'armour.medium'),
          grant('proficiency', 'shield'),
          grant('language', 'druidic'),
        ],
      },
      {
        atLevel: 2,
        effects: [pool('wild_shape', 2, 'short-rest'), grant('feature', 'wild-shape')],
      },
      {
        atLevel: 18,
        effects: [grant('feature', 'timeless-body'), grant('feature', 'beast-spells')],
      },
      { atLevel: 20, effects: [grant('feature', 'archdruid')] },
      ...asiGrants(),
      ...slotGrants(FULL_CASTER),
    ],
  },

  {
    key: 'fighter',
    type: 'class',
    name: 'Fighter',
    data: { hitDie: 10, primary: 'str', saves: ['str', 'con'] },
    grants: [
      {
        effects: [
          add('hp.max', hitPointFormula(10, 'fighter')),
          prof('save.str', 'proficient'),
          prof('save.con', 'proficient'),
          set('attacks', 1),
          grant('proficiency', 'armour.all'),
          grant('proficiency', 'shield'),
          grant('proficiency', 'weapon.simple'),
          grant('proficiency', 'weapon.martial'),
        ],
      },
      {
        atLevel: 1,
        effects: [grant('choice', 'fighting-style'), pool('second-wind', 1, 'short-rest')],
      },
      { atLevel: 2, effects: [pool('action-surge', 1, 'short-rest')] },
      { atLevel: 5, effects: [add('attacks', 1)] },
      { atLevel: 9, effects: [pool('indomitable', 1, 'long-rest')] },
      { atLevel: 11, effects: [add('attacks', 1)] },
      { atLevel: 13, effects: [pool('indomitable', 2, 'long-rest')] },
      {
        atLevel: 17,
        effects: [pool('action-surge', 2, 'short-rest'), pool('indomitable', 3, 'long-rest')],
      },
      { atLevel: 20, effects: [add('attacks', 1)] },
      ...asiGrants(FIGHTER_ASI_LEVELS),
    ],
  },

  {
    key: 'monk',
    type: 'class',
    name: 'Monk',
    data: { hitDie: 8, primary: 'dex', saves: ['str', 'dex'] },
    grants: [
      {
        effects: [
          add('hp.max', hitPointFormula(8, 'monk')),
          prof('save.str', 'proficient'),
          prof('save.dex', 'proficient'),
          set('attacks', 1),
          grant('proficiency', 'weapon.simple'),
          grant('proficiency', 'weapon.shortsword'),
        ],
      },
      // Unarmored Defense, the monk version: DEX + WIS rather than DEX + CON.
      {
        atLevel: 1,
        effects: [set('ac', '10 + attr.dex.mod + attr.wis.mod')],
        when: {
          kind: 'all',
          of: [
            { kind: 'not', of: { kind: 'flag', flag: 'armour.any' } },
            { kind: 'not', of: { kind: 'flag', flag: 'shield' } },
          ],
        },
        detail: 'Unarmored Defense',
      },
      {
        atLevel: 2,
        effects: [
          pool('ki', 'level.monk', 'short-rest'),
          add('speed', 10),
          set('ki.save_dc', '8 + attr.dex.mod + proficiency_bonus'),
        ],
        detail: 'Unarmored Movement',
      },
      { atLevel: 3, effects: [grant('feature', 'deflect-missiles')] },
      { atLevel: 4, effects: [grant('feature', 'slow-fall')] },
      { atLevel: 5, effects: [add('attacks', 1), grant('feature', 'stunning-strike')] },
      { atLevel: 6, effects: [add('speed', 5), grant('feature', 'ki-empowered-strikes')] },
      { atLevel: 7, effects: [grant('feature', 'evasion'), grant('feature', 'stillness-of-mind')] },
      { atLevel: 10, effects: [add('speed', 5), grant('feature', 'purity-of-body')] },
      { atLevel: 13, effects: [grant('feature', 'tongue-of-sun-and-moon')] },
      {
        atLevel: 14,
        effects: [
          add('speed', 5),
          prof('save.str', 'proficient'),
          prof('save.dex', 'proficient'),
          prof('save.con', 'proficient'),
          prof('save.int', 'proficient'),
          prof('save.wis', 'proficient'),
          prof('save.cha', 'proficient'),
        ],
        detail: 'Diamond Soul',
      },
      { atLevel: 18, effects: [add('speed', 5), grant('feature', 'empty-body')] },
      { atLevel: 20, effects: [grant('feature', 'perfect-self')] },
      ...asiGrants(),
    ],
  },

  {
    key: 'paladin',
    type: 'class',
    name: 'Paladin',
    data: { hitDie: 10, primary: 'str', saves: ['wis', 'cha'] },
    grants: [
      {
        effects: [
          add('hp.max', hitPointFormula(10, 'paladin')),
          prof('save.wis', 'proficient'),
          prof('save.cha', 'proficient'),
          set('attacks', 1),
          grant('proficiency', 'armour.all'),
          grant('proficiency', 'shield'),
          grant('proficiency', 'weapon.simple'),
          grant('proficiency', 'weapon.martial'),
        ],
      },
      {
        atLevel: 1,
        effects: [
          pool('lay_on_hands', 'level.paladin * 5', 'long-rest'),
          grant('feature', 'divine-sense'),
        ],
      },
      {
        atLevel: 2,
        effects: [
          grant('choice', 'fighting-style'),
          set('spell.prepared_max', 'max(1, attr.cha.mod + floor(level.paladin / 2))'),
          ...casting('cha', 'prepared'),
          grant('feature', 'divine-smite'),
        ],
      },
      {
        atLevel: 3,
        effects: [pool('channel_divinity', 1, 'short-rest'), grant('feature', 'divine-health')],
      },
      { atLevel: 5, effects: [add('attacks', 1)] },
      // Aura of Protection: everyone in range adds the paladin's CHA to saves.
      {
        atLevel: 6,
        effects: [add('save.all', 'max(1, attr.cha.mod)')],
        detail: 'Aura of Protection',
      },
      { atLevel: 10, effects: [grant('feature', 'aura-of-courage')] },
      { atLevel: 11, effects: [grant('feature', 'improved-divine-smite')] },
      { atLevel: 14, effects: [grant('feature', 'cleansing-touch')] },
      ...asiGrants(),
      ...slotGrants(HALF_CASTER),
    ],
  },

  {
    key: 'ranger',
    type: 'class',
    name: 'Ranger',
    data: { hitDie: 10, primary: 'dex', saves: ['str', 'dex'] },
    grants: [
      {
        effects: [
          add('hp.max', hitPointFormula(10, 'ranger')),
          prof('save.str', 'proficient'),
          prof('save.dex', 'proficient'),
          set('attacks', 1),
          grant('proficiency', 'armour.light'),
          grant('proficiency', 'armour.medium'),
          grant('proficiency', 'shield'),
          grant('proficiency', 'weapon.simple'),
          grant('proficiency', 'weapon.martial'),
        ],
      },
      {
        atLevel: 1,
        effects: [grant('choice', 'favoured-enemy'), grant('choice', 'natural-explorer')],
      },
      {
        atLevel: 2,
        effects: [
          grant('choice', 'fighting-style'),
          set('spell.known_max', 'floor((level.ranger + 1) / 2)'),
          ...casting('wis', 'known'),
        ],
      },
      { atLevel: 3, effects: [grant('feature', 'primeval-awareness')] },
      { atLevel: 5, effects: [add('attacks', 1)] },
      { atLevel: 8, effects: [grant('feature', 'lands-stride')] },
      { atLevel: 10, effects: [grant('feature', 'hide-in-plain-sight')] },
      { atLevel: 14, effects: [grant('feature', 'vanish')] },
      { atLevel: 18, effects: [grant('feature', 'feral-senses')] },
      { atLevel: 20, effects: [grant('feature', 'foe-slayer')] },
      ...asiGrants(),
      ...slotGrants(HALF_CASTER),
    ],
  },

  {
    key: 'rogue',
    type: 'class',
    name: 'Rogue',
    data: { hitDie: 8, primary: 'dex', saves: ['dex', 'int'] },
    grants: [
      {
        effects: [
          add('hp.max', hitPointFormula(8, 'rogue')),
          prof('save.dex', 'proficient'),
          prof('save.int', 'proficient'),
          set('attacks', 1),
          // Sneak Attack scales every odd level: 1d6 at 1, 10d6 at 19.
          set('sneak_attack.dice', 'ceil(level.rogue / 2)'),
          grant('proficiency', 'armour.light'),
          grant('proficiency', 'weapon.simple'),
          grant('feature', 'sneak-attack'),
          grant('language', 'thieves-cant'),
        ],
      },
      { atLevel: 1, effects: [grant('choice', 'expertise')] },
      { atLevel: 2, effects: [grant('feature', 'cunning-action')] },
      { atLevel: 5, effects: [grant('feature', 'uncanny-dodge')] },
      { atLevel: 6, effects: [grant('choice', 'expertise')] },
      { atLevel: 7, effects: [grant('feature', 'evasion')] },
      { atLevel: 11, effects: [grant('feature', 'reliable-talent')] },
      { atLevel: 14, effects: [grant('sense', 'blindsense', { range: 10 })] },
      { atLevel: 15, effects: [prof('save.wis', 'proficient')], detail: 'Slippery Mind' },
      { atLevel: 18, effects: [grant('feature', 'elusive')] },
      { atLevel: 20, effects: [pool('stroke_of_luck', 1, 'short-rest')] },
      ...asiGrants(ROGUE_ASI_LEVELS),
    ],
  },

  {
    key: 'sorcerer',
    type: 'class',
    name: 'Sorcerer',
    data: { hitDie: 6, primary: 'cha', saves: ['con', 'cha'] },
    grants: [
      {
        effects: [
          add('hp.max', hitPointFormula(6, 'sorcerer')),
          prof('save.con', 'proficient'),
          prof('save.cha', 'proficient'),
          set('attacks', 1),
          set('spell.known_max', 'min(15, level.sorcerer + 1)'),
          ...casting('cha', 'known'),
          grant('proficiency', 'weapon.simple'),
        ],
      },
      {
        atLevel: 2,
        effects: [
          pool('sorcery_points', 'level.sorcerer', 'long-rest'),
          grant('feature', 'font-of-magic'),
        ],
      },
      { atLevel: 3, effects: [grant('choice', 'metamagic')] },
      { atLevel: 10, effects: [grant('choice', 'metamagic')] },
      { atLevel: 17, effects: [grant('choice', 'metamagic')] },
      { atLevel: 20, effects: [grant('feature', 'sorcerous-restoration')] },
      ...asiGrants(),
      ...slotGrants(FULL_CASTER),
    ],
  },

  {
    key: 'warlock',
    type: 'class',
    name: 'Warlock',
    data: { hitDie: 8, primary: 'cha', saves: ['wis', 'cha'] },
    grants: [
      {
        effects: [
          add('hp.max', hitPointFormula(8, 'warlock')),
          prof('save.wis', 'proficient'),
          prof('save.cha', 'proficient'),
          set('attacks', 1),
          set('spell.known_max', 'min(15, level.warlock + 1)'),
          ...casting('cha', 'known'),
          grant('proficiency', 'armour.light'),
          grant('proficiency', 'weapon.simple'),
        ],
      },
      { atLevel: 2, effects: [grant('choice', 'eldritch-invocation')] },
      { atLevel: 3, effects: [grant('choice', 'pact-boon')] },
      { atLevel: 11, effects: [pool('mystic_arcanum.6', 1, 'long-rest', 6)] },
      { atLevel: 13, effects: [pool('mystic_arcanum.7', 1, 'long-rest', 7)] },
      { atLevel: 15, effects: [pool('mystic_arcanum.8', 1, 'long-rest', 8)] },
      { atLevel: 17, effects: [pool('mystic_arcanum.9', 1, 'long-rest', 9)] },
      { atLevel: 20, effects: [grant('feature', 'eldritch-master')] },
      ...asiGrants(),
      ...pactGrants(PACT_MAGIC),
    ],
  },

  {
    key: 'wizard',
    type: 'class',
    name: 'Wizard',
    data: { hitDie: 6, primary: 'int', saves: ['int', 'wis'] },
    grants: [
      {
        effects: [
          add('hp.max', hitPointFormula(6, 'wizard')),
          prof('save.int', 'proficient'),
          prof('save.wis', 'proficient'),
          set('attacks', 1),
          set('spell.prepared_max', 'max(1, attr.int.mod + level.wizard)'),
          ...casting('int', 'prepared'),
          grant('proficiency', 'weapon.simple'),
        ],
      },
      { atLevel: 1, effects: [pool('arcane_recovery', 1, 'long-rest')] },
      { atLevel: 18, effects: [grant('feature', 'spell-mastery')] },
      { atLevel: 20, effects: [grant('feature', 'signature-spells')] },
      ...asiGrants(),
      ...slotGrants(FULL_CASTER),
    ],
  },
];

/** One subclass per class — the SRD's limit, not the platform's. */
export const subclasses2014: ModuleEntity[] = [
  {
    key: 'barbarian-berserker',
    type: 'subclass',
    name: 'Path of the Berserker',
    grants: [
      { atLevel: 3, effects: [grant('feature', 'frenzy')] },
      { atLevel: 6, effects: [grant('feature', 'mindless-rage')] },
      { atLevel: 10, effects: [grant('feature', 'intimidating-presence')] },
      { atLevel: 14, effects: [grant('feature', 'retaliation')] },
    ],
  },
  {
    key: 'bard-lore',
    type: 'subclass',
    name: 'College of Lore',
    grants: [
      {
        atLevel: 3,
        effects: [grant('choice', 'bonus-proficiencies'), grant('feature', 'cutting-words')],
      },
      { atLevel: 6, effects: [grant('feature', 'additional-magical-secrets')] },
      { atLevel: 14, effects: [grant('feature', 'peerless-skill')] },
    ],
  },
  {
    key: 'cleric-life',
    type: 'subclass',
    name: 'Life Domain',
    grants: [
      {
        atLevel: 1,
        effects: [grant('proficiency', 'armour.heavy'), grant('feature', 'disciple-of-life')],
      },
      { atLevel: 2, effects: [grant('feature', 'preserve-life')] },
      { atLevel: 6, effects: [grant('feature', 'blessed-healer')] },
      { atLevel: 8, effects: [grant('feature', 'divine-strike')] },
      { atLevel: 17, effects: [grant('feature', 'supreme-healing')] },
    ],
  },
  {
    key: 'druid-land',
    type: 'subclass',
    name: 'Circle of the Land',
    grants: [
      {
        atLevel: 2,
        effects: [grant('feature', 'natural-recovery'), grant('choice', 'druid-land')],
      },
      { atLevel: 6, effects: [grant('feature', 'lands-stride')] },
      { atLevel: 10, effects: [grant('feature', 'natures-ward')] },
      { atLevel: 14, effects: [grant('feature', 'natures-sanctuary')] },
    ],
  },
  {
    key: 'fighter-champion',
    type: 'subclass',
    name: 'Champion',
    grants: [
      { atLevel: 3, effects: [set('crit.range', 19)], detail: 'Improved Critical' },
      { atLevel: 7, effects: [grant('feature', 'remarkable-athlete')] },
      { atLevel: 10, effects: [grant('choice', 'fighting-style')] },
      { atLevel: 15, effects: [set('crit.range', 18)], detail: 'Superior Critical' },
      { atLevel: 18, effects: [grant('feature', 'survivor')] },
    ],
  },
  {
    key: 'monk-open-hand',
    type: 'subclass',
    name: 'Way of the Open Hand',
    grants: [
      { atLevel: 3, effects: [grant('feature', 'open-hand-technique')] },
      { atLevel: 6, effects: [pool('wholeness_of_body', 1, 'long-rest')] },
      { atLevel: 11, effects: [grant('feature', 'tranquility')] },
      { atLevel: 17, effects: [grant('feature', 'quivering-palm')] },
    ],
  },
  {
    key: 'paladin-devotion',
    type: 'subclass',
    name: 'Oath of Devotion',
    grants: [
      {
        atLevel: 3,
        effects: [grant('feature', 'sacred-weapon'), grant('feature', 'turn-the-unholy')],
      },
      { atLevel: 7, effects: [grant('feature', 'aura-of-devotion')] },
      { atLevel: 15, effects: [grant('feature', 'purity-of-spirit')] },
      { atLevel: 20, effects: [grant('feature', 'holy-nimbus')] },
    ],
  },
  {
    key: 'ranger-hunter',
    type: 'subclass',
    name: 'Hunter',
    grants: [
      { atLevel: 3, effects: [grant('choice', 'hunters-prey')] },
      { atLevel: 7, effects: [grant('choice', 'defensive-tactics')] },
      { atLevel: 11, effects: [grant('choice', 'multiattack')] },
      { atLevel: 15, effects: [grant('choice', 'superior-hunters-defence')] },
    ],
  },
  {
    key: 'rogue-thief',
    type: 'subclass',
    name: 'Thief',
    grants: [
      {
        atLevel: 3,
        effects: [grant('feature', 'fast-hands'), grant('feature', 'second-story-work')],
      },
      { atLevel: 9, effects: [grant('feature', 'supreme-sneak')] },
      { atLevel: 13, effects: [grant('feature', 'use-magic-device')] },
      { atLevel: 17, effects: [grant('feature', 'thiefs-reflexes')] },
    ],
  },
  {
    key: 'sorcerer-draconic',
    type: 'subclass',
    name: 'Draconic Bloodline',
    grants: [
      // Draconic Resilience: +1 HP per level, and unarmoured AC of 13 + DEX.
      {
        atLevel: 1,
        effects: [add('hp.max', 'level.sorcerer'), grant('choice', 'draconic-ancestry')],
      },
      {
        atLevel: 1,
        effects: [set('ac', '13 + attr.dex.mod')],
        when: { kind: 'not', of: { kind: 'flag', flag: 'armour.any' } },
        detail: 'Draconic Resilience',
      },
      { atLevel: 6, effects: [grant('feature', 'elemental-affinity')] },
      { atLevel: 14, effects: [grant('movement', 'fly')] },
      { atLevel: 18, effects: [grant('feature', 'draconic-presence')] },
    ],
  },
  {
    key: 'warlock-fiend',
    type: 'subclass',
    name: 'The Fiend',
    grants: [
      { atLevel: 1, effects: [grant('feature', 'dark-ones-blessing')] },
      { atLevel: 6, effects: [grant('feature', 'dark-ones-own-luck')] },
      { atLevel: 10, effects: [grant('feature', 'fiendish-resilience')] },
      { atLevel: 14, effects: [grant('feature', 'hurl-through-hell')] },
    ],
  },
  {
    key: 'wizard-evocation',
    type: 'subclass',
    name: 'School of Evocation',
    grants: [
      {
        atLevel: 2,
        effects: [grant('feature', 'evocation-savant'), grant('feature', 'sculpt-spells')],
      },
      { atLevel: 6, effects: [grant('feature', 'potent-cantrip')] },
      { atLevel: 10, effects: [grant('feature', 'empowered-evocation')] },
      { atLevel: 14, effects: [grant('feature', 'overchannel')] },
    ],
  },
];
