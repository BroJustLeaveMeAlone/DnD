import type { ModuleEntity } from '@ttrpg/rules-engine';
import { all, expression } from '@ttrpg/rules-engine';
import { add, disadvantage, floorAt, grant, noArmour, noShield, set } from '../authoring.js';

/**
 * SRD armour and weapons.
 *
 * Generated from tables rather than written out. Armour differs only in a few
 * numbers and a stealth penalty; weapons differ only in damage, properties, and
 * cost. Writing forty near-identical entities by hand invites exactly the sort
 * of copy-paste error that a table makes impossible.
 */

type ArmourCategory = 'light' | 'medium' | 'heavy';

interface ArmourRow {
  key: string;
  name: string;
  category: ArmourCategory;
  /** Base AC before any Dexterity contribution. */
  base: number;
  /** Minimum Strength, below which speed drops by 10 feet. */
  strength?: number;
  /** Disadvantage on Stealth while worn. */
  stealth?: boolean;
  cost: string;
  weight: number;
}

const ARMOUR: ArmourRow[] = [
  { key: 'padded', name: 'Padded', category: 'light', base: 11, stealth: true, cost: '5 gp', weight: 8 },
  { key: 'leather-armour', name: 'Leather', category: 'light', base: 11, cost: '10 gp', weight: 10 },
  { key: 'studded-leather', name: 'Studded Leather', category: 'light', base: 12, cost: '45 gp', weight: 13 },

  { key: 'hide', name: 'Hide', category: 'medium', base: 12, cost: '10 gp', weight: 12 },
  { key: 'chain-shirt', name: 'Chain Shirt', category: 'medium', base: 13, cost: '50 gp', weight: 20 },
  { key: 'scale-mail', name: 'Scale Mail', category: 'medium', base: 14, stealth: true, cost: '50 gp', weight: 45 },
  { key: 'breastplate', name: 'Breastplate', category: 'medium', base: 14, cost: '400 gp', weight: 20 },
  { key: 'half-plate', name: 'Half Plate', category: 'medium', base: 15, stealth: true, cost: '750 gp', weight: 40 },

  { key: 'ring-mail', name: 'Ring Mail', category: 'heavy', base: 14, stealth: true, cost: '30 gp', weight: 40 },
  { key: 'chain-mail', name: 'Chain Mail', category: 'heavy', base: 16, strength: 13, stealth: true, cost: '75 gp', weight: 55 },
  { key: 'splint', name: 'Splint', category: 'heavy', base: 17, strength: 15, stealth: true, cost: '200 gp', weight: 60 },
  { key: 'plate', name: 'Plate', category: 'heavy', base: 18, strength: 15, stealth: true, cost: '1,500 gp', weight: 65 },
];

/**
 * Light armour adds all of Dexterity, medium caps the bonus at +2, and heavy
 * ignores it. The cap is expressed with `min` rather than a clamp effect
 * because it applies to one term of the sum, not to the finished AC.
 */
const armourFormula = (row: ArmourRow): string => {
  if (row.category === 'light') return `${row.base} + attr.dex.mod`;
  if (row.category === 'medium') return `${row.base} + min(2, attr.dex.mod)`;
  return String(row.base);
};

const armour: ModuleEntity[] = ARMOUR.map((row) => ({
  key: row.key,
  type: 'item',
  name: row.name,
  data: {
    slot: 'armour',
    category: row.category,
    ac: row.base,
    ...(row.strength ? { strengthRequirement: row.strength } : {}),
    ...(row.stealth ? { stealthDisadvantage: true } : {}),
    cost: row.cost,
    weight: row.weight,
  },
  grants: [
    {
      effects: [
        set('ac', armourFormula(row)),
        grant('state', `armour.${row.category}`),
        ...(row.stealth ? [disadvantage('skill.stealth')] : []),
      ],
    },
    ...(row.strength
      ? [
          {
            effects: [add('speed', -10)],
            when: expression(`attr.str.score < ${row.strength}`),
            detail: `Strength below ${row.strength}`,
          },
        ]
      : []),
  ],
}));

interface WeaponRow {
  key: string;
  name: string;
  category: 'simple' | 'martial';
  ranged?: boolean;
  damage: string;
  damageType: 'bludgeoning' | 'piercing' | 'slashing';
  properties?: string[];
  versatile?: string;
  range?: string;
  cost: string;
  weight: number;
}

const WEAPONS: WeaponRow[] = [
  // Simple melee
  { key: 'club', name: 'Club', category: 'simple', damage: '1d4', damageType: 'bludgeoning', properties: ['light'], cost: '1 sp', weight: 2 },
  { key: 'dagger', name: 'Dagger', category: 'simple', damage: '1d4', damageType: 'piercing', properties: ['finesse', 'light', 'thrown'], range: '20/60', cost: '2 gp', weight: 1 },
  { key: 'greatclub', name: 'Greatclub', category: 'simple', damage: '1d8', damageType: 'bludgeoning', properties: ['two-handed'], cost: '2 sp', weight: 10 },
  { key: 'handaxe', name: 'Handaxe', category: 'simple', damage: '1d6', damageType: 'slashing', properties: ['light', 'thrown'], range: '20/60', cost: '5 gp', weight: 2 },
  { key: 'javelin', name: 'Javelin', category: 'simple', damage: '1d6', damageType: 'piercing', properties: ['thrown'], range: '30/120', cost: '5 sp', weight: 2 },
  { key: 'light-hammer', name: 'Light Hammer', category: 'simple', damage: '1d4', damageType: 'bludgeoning', properties: ['light', 'thrown'], range: '20/60', cost: '2 gp', weight: 2 },
  { key: 'mace', name: 'Mace', category: 'simple', damage: '1d6', damageType: 'bludgeoning', cost: '5 gp', weight: 4 },
  { key: 'quarterstaff', name: 'Quarterstaff', category: 'simple', damage: '1d6', damageType: 'bludgeoning', properties: ['versatile'], versatile: '1d8', cost: '2 sp', weight: 4 },
  { key: 'sickle', name: 'Sickle', category: 'simple', damage: '1d4', damageType: 'slashing', properties: ['light'], cost: '1 gp', weight: 2 },
  { key: 'spear', name: 'Spear', category: 'simple', damage: '1d6', damageType: 'piercing', properties: ['thrown', 'versatile'], versatile: '1d8', range: '20/60', cost: '1 gp', weight: 3 },

  // Simple ranged
  { key: 'light-crossbow', name: 'Light Crossbow', category: 'simple', ranged: true, damage: '1d8', damageType: 'piercing', properties: ['ammunition', 'loading', 'two-handed'], range: '80/320', cost: '25 gp', weight: 5 },
  { key: 'dart', name: 'Dart', category: 'simple', ranged: true, damage: '1d4', damageType: 'piercing', properties: ['finesse', 'thrown'], range: '20/60', cost: '5 cp', weight: 0.25 },
  { key: 'shortbow', name: 'Shortbow', category: 'simple', ranged: true, damage: '1d6', damageType: 'piercing', properties: ['ammunition', 'two-handed'], range: '80/320', cost: '25 gp', weight: 2 },
  { key: 'sling', name: 'Sling', category: 'simple', ranged: true, damage: '1d4', damageType: 'bludgeoning', properties: ['ammunition'], range: '30/120', cost: '1 sp', weight: 0 },

  // Martial melee
  { key: 'battleaxe', name: 'Battleaxe', category: 'martial', damage: '1d8', damageType: 'slashing', properties: ['versatile'], versatile: '1d10', cost: '10 gp', weight: 4 },
  { key: 'flail', name: 'Flail', category: 'martial', damage: '1d8', damageType: 'bludgeoning', cost: '10 gp', weight: 2 },
  { key: 'glaive', name: 'Glaive', category: 'martial', damage: '1d10', damageType: 'slashing', properties: ['heavy', 'reach', 'two-handed'], cost: '20 gp', weight: 6 },
  { key: 'greataxe', name: 'Greataxe', category: 'martial', damage: '1d12', damageType: 'slashing', properties: ['heavy', 'two-handed'], cost: '30 gp', weight: 7 },
  { key: 'greatsword', name: 'Greatsword', category: 'martial', damage: '2d6', damageType: 'slashing', properties: ['heavy', 'two-handed'], cost: '50 gp', weight: 6 },
  { key: 'halberd', name: 'Halberd', category: 'martial', damage: '1d10', damageType: 'slashing', properties: ['heavy', 'reach', 'two-handed'], cost: '20 gp', weight: 6 },
  { key: 'lance', name: 'Lance', category: 'martial', damage: '1d12', damageType: 'piercing', properties: ['reach', 'special'], cost: '10 gp', weight: 6 },
  { key: 'longsword', name: 'Longsword', category: 'martial', damage: '1d8', damageType: 'slashing', properties: ['versatile'], versatile: '1d10', cost: '15 gp', weight: 3 },
  { key: 'maul', name: 'Maul', category: 'martial', damage: '2d6', damageType: 'bludgeoning', properties: ['heavy', 'two-handed'], cost: '10 gp', weight: 10 },
  { key: 'morningstar', name: 'Morningstar', category: 'martial', damage: '1d8', damageType: 'piercing', cost: '15 gp', weight: 4 },
  { key: 'pike', name: 'Pike', category: 'martial', damage: '1d10', damageType: 'piercing', properties: ['heavy', 'reach', 'two-handed'], cost: '5 gp', weight: 18 },
  { key: 'rapier', name: 'Rapier', category: 'martial', damage: '1d8', damageType: 'piercing', properties: ['finesse'], cost: '25 gp', weight: 2 },
  { key: 'scimitar', name: 'Scimitar', category: 'martial', damage: '1d6', damageType: 'slashing', properties: ['finesse', 'light'], cost: '25 gp', weight: 3 },
  { key: 'shortsword', name: 'Shortsword', category: 'martial', damage: '1d6', damageType: 'piercing', properties: ['finesse', 'light'], cost: '10 gp', weight: 2 },
  { key: 'trident', name: 'Trident', category: 'martial', damage: '1d6', damageType: 'piercing', properties: ['thrown', 'versatile'], versatile: '1d8', range: '20/60', cost: '5 gp', weight: 4 },
  { key: 'war-pick', name: 'War Pick', category: 'martial', damage: '1d8', damageType: 'piercing', cost: '5 gp', weight: 2 },
  { key: 'warhammer', name: 'Warhammer', category: 'martial', damage: '1d8', damageType: 'bludgeoning', properties: ['versatile'], versatile: '1d10', cost: '15 gp', weight: 2 },
  { key: 'whip', name: 'Whip', category: 'martial', damage: '1d4', damageType: 'slashing', properties: ['finesse', 'reach'], cost: '2 gp', weight: 3 },

  // Martial ranged
  { key: 'blowgun', name: 'Blowgun', category: 'martial', ranged: true, damage: '1', damageType: 'piercing', properties: ['ammunition', 'loading'], range: '25/100', cost: '10 gp', weight: 1 },
  { key: 'hand-crossbow', name: 'Hand Crossbow', category: 'martial', ranged: true, damage: '1d6', damageType: 'piercing', properties: ['ammunition', 'light', 'loading'], range: '30/120', cost: '75 gp', weight: 3 },
  { key: 'heavy-crossbow', name: 'Heavy Crossbow', category: 'martial', ranged: true, damage: '1d10', damageType: 'piercing', properties: ['ammunition', 'heavy', 'loading', 'two-handed'], range: '100/400', cost: '50 gp', weight: 18 },
  { key: 'longbow', name: 'Longbow', category: 'martial', ranged: true, damage: '1d8', damageType: 'piercing', properties: ['ammunition', 'heavy', 'two-handed'], range: '150/600', cost: '50 gp', weight: 2 },
  { key: 'net', name: 'Net', category: 'martial', ranged: true, damage: '0', damageType: 'bludgeoning', properties: ['special', 'thrown'], range: '5/15', cost: '1 gp', weight: 3 },
];

/**
 * Finesse weapons use the better of Strength and Dexterity; ranged weapons use
 * Dexterity. The choice is recorded on the grant rather than resolved here,
 * because which is better depends on the character holding it.
 */
const attackAbility = (row: WeaponRow): string =>
  row.properties?.includes('finesse') ? 'best' : row.ranged ? 'dex' : 'str';

const weapons: ModuleEntity[] = WEAPONS.map((row) => ({
  key: row.key,
  type: 'item',
  name: row.name,
  data: {
    slot: 'weapon',
    category: row.category,
    kind: row.ranged ? 'ranged' : 'melee',
    damage: row.damage,
    damageType: row.damageType,
    ...(row.versatile ? { versatile: row.versatile } : {}),
    ...(row.range ? { range: row.range } : {}),
    properties: row.properties ?? [],
    cost: row.cost,
    weight: row.weight,
  },
  grants: [
    {
      effects: [
        grant('attack', row.key, {
          ability: attackAbility(row),
          damage: row.damage,
          damageType: row.damageType,
          ...(row.versatile ? { versatile: row.versatile } : {}),
          ...(row.range ? { range: row.range } : {}),
          properties: row.properties ?? [],
        }),
      ],
    },
  ],
}));

const gear: ModuleEntity[] = [
  {
    key: 'shield',
    type: 'item',
    name: 'Shield',
    data: { slot: 'shield', ac: 2, cost: '10 gp', weight: 6 },
    grants: [{ effects: [add('ac', 2), grant('state', 'shield')] }],
  },
];

/** The SRD's magic items that change a computed value. */
const magicItems: ModuleEntity[] = [
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
    key: 'cloak-of-protection',
    type: 'item',
    name: 'Cloak of Protection',
    data: { rarity: 'uncommon', attunement: true },
    grants: [
      {
        // Same deflection type as the ring, so wearing both grants only the
        // larger. Typing these is what makes that automatic.
        effects: [add('ac', 1, 'deflection'), add('save.all', 1, 'deflection')],
        detail: 'attuned',
      },
    ],
  },
  {
    key: 'bracers-of-defense',
    type: 'item',
    name: 'Bracers of Defense',
    data: { rarity: 'rare', attunement: true },
    grants: [
      {
        effects: [add('ac', 2, 'bracers')],
        when: all(noArmour, noShield),
        detail: 'no armour or shield',
      },
    ],
  },
  {
    key: 'amulet-of-health',
    type: 'item',
    name: 'Amulet of Health',
    data: { rarity: 'rare', attunement: true },
    // A floor, not a set. The book says it has no effect if Constitution is
    // already 19 or higher, and `set` would drag a 20 down to 19.
    grants: [{ effects: [floorAt('attr.con.score', 19)], detail: 'attuned' }],
  },
  {
    key: 'belt-of-hill-giant-strength',
    type: 'item',
    name: 'Belt of Hill Giant Strength',
    data: { rarity: 'rare', attunement: true },
    grants: [{ effects: [floorAt('attr.str.score', 21)], detail: 'attuned' }],
  },
];

export const equipment2014: ModuleEntity[] = [...armour, ...weapons, ...gear, ...magicItems];
