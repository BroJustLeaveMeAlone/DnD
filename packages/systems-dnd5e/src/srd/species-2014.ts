import type { ModuleEntity } from '@ttrpg/rules-engine';
import { add, advantage, grant, prof, resist, sense, set } from '../authoring.js';

/**
 * SRD 5.1 races, including subraces.
 *
 * Modelled as flat entities rather than a race/subrace hierarchy. A subrace
 * always accompanies its race and never appears alone, so nesting would add a
 * relationship the character builder must then resolve, in exchange for
 * describing something that is always taken as one unit. `data.baseRace` keeps
 * the grouping available for display without making it structural.
 */
export const species2014: ModuleEntity[] = [
  {
    key: 'human',
    type: 'species',
    name: 'Human',
    data: { size: 'medium' },
    grants: [
      {
        effects: [
          add('attr.str.score', 1),
          add('attr.dex.score', 1),
          add('attr.con.score', 1),
          add('attr.int.score', 1),
          add('attr.wis.score', 1),
          add('attr.cha.score', 1),
          set('speed', 30),
          grant('language', 'common'),
          grant('choice', 'extra-language'),
        ],
      },
    ],
  },

  {
    key: 'dwarf-hill',
    type: 'species',
    name: 'Hill Dwarf',
    data: { size: 'medium', baseRace: 'dwarf' },
    grants: [
      {
        effects: [
          add('attr.con.score', 2),
          add('attr.wis.score', 1),
          set('speed', 25),
          sense('darkvision', 60),
          resist('poison'),
          advantage('save.poison'),
          // Dwarven Toughness: one extra hit point per level.
          add('hp.max', 'level'),
          grant('proficiency', 'weapon.battleaxe'),
          grant('proficiency', 'weapon.handaxe'),
          grant('proficiency', 'weapon.warhammer'),
          grant('proficiency', 'tool.smiths'),
          grant('feature', 'stonecunning'),
          grant('language', 'common'),
          grant('language', 'dwarvish'),
        ],
      },
    ],
  },

  {
    key: 'dwarf-mountain',
    type: 'species',
    name: 'Mountain Dwarf',
    data: { size: 'medium', baseRace: 'dwarf' },
    grants: [
      {
        effects: [
          add('attr.con.score', 2),
          add('attr.str.score', 2),
          set('speed', 25),
          sense('darkvision', 60),
          resist('poison'),
          advantage('save.poison'),
          grant('proficiency', 'armour.light'),
          grant('proficiency', 'armour.medium'),
          grant('feature', 'stonecunning'),
          grant('language', 'common'),
          grant('language', 'dwarvish'),
        ],
      },
    ],
  },

  {
    key: 'elf-high',
    type: 'species',
    name: 'High Elf',
    data: { size: 'medium', baseRace: 'elf' },
    grants: [
      {
        effects: [
          add('attr.dex.score', 2),
          add('attr.int.score', 1),
          set('speed', 30),
          sense('darkvision', 60),
          prof('skill.perception', 'proficient'),
          advantage('save.charmed'),
          grant('feature', 'fey-ancestry'),
          grant('feature', 'trance'),
          grant('proficiency', 'weapon.longsword'),
          grant('proficiency', 'weapon.shortsword'),
          grant('proficiency', 'weapon.longbow'),
          grant('proficiency', 'weapon.shortbow'),
          grant('casting', 'cantrip', { list: 'wizard', count: 1, ability: 'int' }),
          grant('language', 'common'),
          grant('language', 'elvish'),
          grant('choice', 'extra-language'),
        ],
      },
    ],
  },

  {
    key: 'elf-wood',
    type: 'species',
    name: 'Wood Elf',
    data: { size: 'medium', baseRace: 'elf' },
    grants: [
      {
        effects: [
          add('attr.dex.score', 2),
          add('attr.wis.score', 1),
          set('speed', 35),
          sense('darkvision', 60),
          prof('skill.perception', 'proficient'),
          advantage('save.charmed'),
          grant('feature', 'fey-ancestry'),
          grant('feature', 'trance'),
          grant('feature', 'mask-of-the-wild'),
          grant('proficiency', 'weapon.longsword'),
          grant('proficiency', 'weapon.shortsword'),
          grant('proficiency', 'weapon.longbow'),
          grant('proficiency', 'weapon.shortbow'),
          grant('language', 'common'),
          grant('language', 'elvish'),
        ],
      },
    ],
  },

  {
    key: 'elf-drow',
    type: 'species',
    name: 'Dark Elf (Drow)',
    data: { size: 'medium', baseRace: 'elf' },
    grants: [
      {
        effects: [
          add('attr.dex.score', 2),
          add('attr.cha.score', 1),
          set('speed', 30),
          sense('darkvision', 120),
          prof('skill.perception', 'proficient'),
          advantage('save.charmed'),
          grant('feature', 'fey-ancestry'),
          grant('feature', 'trance'),
          grant('feature', 'sunlight-sensitivity'),
          grant('proficiency', 'weapon.rapier'),
          grant('proficiency', 'weapon.shortsword'),
          grant('proficiency', 'weapon.hand-crossbow'),
          grant('casting', 'innate', { ability: 'cha', spells: ['dancing-lights'] }),
          grant('language', 'common'),
          grant('language', 'elvish'),
        ],
      },
      // Drow Magic unlocks further spells with level.
      {
        atLevel: 3,
        effects: [grant('casting', 'innate', { spells: ['faerie-fire'], uses: 'long-rest' })],
      },
      {
        atLevel: 5,
        effects: [grant('casting', 'innate', { spells: ['darkness'], uses: 'long-rest' })],
      },
    ],
  },

  {
    key: 'halfling-lightfoot',
    type: 'species',
    name: 'Lightfoot Halfling',
    data: { size: 'small', baseRace: 'halfling' },
    grants: [
      {
        effects: [
          add('attr.dex.score', 2),
          add('attr.cha.score', 1),
          set('speed', 25),
          advantage('save.frightened'),
          grant('feature', 'lucky'),
          grant('feature', 'halfling-nimbleness'),
          grant('feature', 'naturally-stealthy'),
          grant('language', 'common'),
          grant('language', 'halfling'),
        ],
      },
    ],
  },

  {
    key: 'halfling-stout',
    type: 'species',
    name: 'Stout Halfling',
    data: { size: 'small', baseRace: 'halfling' },
    grants: [
      {
        effects: [
          add('attr.dex.score', 2),
          add('attr.con.score', 1),
          set('speed', 25),
          advantage('save.frightened'),
          advantage('save.poison'),
          resist('poison'),
          grant('feature', 'lucky'),
          grant('feature', 'halfling-nimbleness'),
          grant('language', 'common'),
          grant('language', 'halfling'),
        ],
      },
    ],
  },

  {
    key: 'dragonborn',
    type: 'species',
    name: 'Dragonborn',
    data: { size: 'medium' },
    grants: [
      {
        effects: [
          add('attr.str.score', 2),
          add('attr.cha.score', 1),
          set('speed', 30),
          grant('choice', 'draconic-ancestry'),
          grant('action', 'breath-weapon', { recharge: 'short-rest' }),
          grant('language', 'common'),
          grant('language', 'draconic'),
        ],
      },
    ],
  },

  {
    key: 'gnome-rock',
    type: 'species',
    name: 'Rock Gnome',
    data: { size: 'small', baseRace: 'gnome' },
    grants: [
      {
        effects: [
          add('attr.int.score', 2),
          add('attr.con.score', 1),
          set('speed', 25),
          sense('darkvision', 60),
          // Gnome Cunning: advantage on all mental saves against magic.
          advantage('save.int.magic'),
          advantage('save.wis.magic'),
          advantage('save.cha.magic'),
          grant('feature', 'artificers-lore'),
          grant('feature', 'tinker'),
          grant('proficiency', 'tool.tinkers'),
          grant('language', 'common'),
          grant('language', 'gnomish'),
        ],
      },
    ],
  },

  {
    key: 'half-elf',
    type: 'species',
    name: 'Half-Elf',
    data: { size: 'medium' },
    grants: [
      {
        effects: [
          add('attr.cha.score', 2),
          set('speed', 30),
          sense('darkvision', 60),
          advantage('save.charmed'),
          grant('feature', 'fey-ancestry'),
          // Two ability increases and two skills, both chosen.
          grant('choice', 'half-elf-ability-increase'),
          grant('choice', 'skill-versatility'),
          grant('language', 'common'),
          grant('language', 'elvish'),
          grant('choice', 'extra-language'),
        ],
      },
    ],
  },

  {
    key: 'half-orc',
    type: 'species',
    name: 'Half-Orc',
    data: { size: 'medium' },
    grants: [
      {
        effects: [
          add('attr.str.score', 2),
          add('attr.con.score', 1),
          set('speed', 30),
          sense('darkvision', 60),
          prof('skill.intimidation', 'proficient'),
          grant('feature', 'relentless-endurance'),
          grant('feature', 'savage-attacks'),
          grant('language', 'common'),
          grant('language', 'orc'),
        ],
      },
    ],
  },

  {
    key: 'tiefling',
    type: 'species',
    name: 'Tiefling',
    data: { size: 'medium' },
    grants: [
      {
        effects: [
          add('attr.cha.score', 2),
          add('attr.int.score', 1),
          set('speed', 30),
          sense('darkvision', 60),
          resist('fire'),
          grant('casting', 'innate', { ability: 'cha', spells: ['thaumaturgy'] }),
          grant('language', 'common'),
          grant('language', 'infernal'),
        ],
      },
      {
        atLevel: 3,
        effects: [grant('casting', 'innate', { spells: ['hellish-rebuke'], uses: 'long-rest' })],
      },
      {
        atLevel: 5,
        effects: [grant('casting', 'innate', { spells: ['darkness'], uses: 'long-rest' })],
      },
    ],
  },
];
