import { lintSystem } from '@ttrpg/rules-engine';
import { describe, expect, it } from 'vitest';
import { dnd5e2014 } from '../dnd5e-2014.js';
import { buildSheet } from '../index.js';
import { FULL_CASTER, HALF_CASTER, PACT_MAGIC } from './progressions.js';

/**
 * The SRD 5.1 content, checked against the book.
 *
 * These are hand-verified numbers, not snapshots. A snapshot would happily
 * record a wrong value; a number taken from the rules fails when the encoding
 * drifts from them.
 */

const abilities = { str: 15, dex: 14, con: 14, int: 12, wis: 13, cha: 10 };

const sheet = (over: {
  attributes?: Record<string, number>;
  taken?: string[];
  classes?: { key: string; subclass?: string; level: number }[];
  inventory?: { key: string; equipped?: boolean; attuned?: boolean }[];
  flags?: string[];
}) =>
  buildSheet(dnd5e2014, {
    attributes: { ...abilities, ...over.attributes },
    taken: over.taken ?? [],
    classes: over.classes ?? [],
    inventory: over.inventory ?? [],
    ...(over.flags ? { flags: over.flags } : {}),
  });

describe('coverage', () => {
  it('has all twelve SRD classes, each with a subclass', () => {
    const classes = dnd5e2014.entities.filter((e) => e.type === 'class');
    const subclasses = dnd5e2014.entities.filter((e) => e.type === 'subclass');

    expect(classes).toHaveLength(12);
    expect(subclasses).toHaveLength(12);
    expect(classes.map((c) => c.key).sort()).toEqual([
      'barbarian',
      'bard',
      'cleric',
      'druid',
      'fighter',
      'monk',
      'paladin',
      'ranger',
      'rogue',
      'sorcerer',
      'warlock',
      'wizard',
    ]);
  });

  it('has every SRD race and subrace', () => {
    const species = dnd5e2014.entities.filter((e) => e.type === 'species');
    expect(species.map((s) => s.key).sort()).toEqual([
      'dragonborn',
      'dwarf-hill',
      'dwarf-mountain',
      'elf-drow',
      'elf-high',
      'elf-wood',
      'gnome-rock',
      'half-elf',
      'half-orc',
      'halfling-lightfoot',
      'halfling-stout',
      'human',
      'tiefling',
    ]);
  });

  it('lints clean, with probe characters at every level of every class', () => {
    const report = lintSystem(dnd5e2014);
    expect(report.findings.filter((f) => f.severity !== 'info')).toEqual([]);
    expect(report.probes).toEqual([]);
  });
});

describe('spell slot tables match the book', () => {
  it('full casters peak correctly', () => {
    // Wizard 20: 4/3/3/3/3/2/2/1/1
    expect(FULL_CASTER[19]).toEqual([4, 3, 3, 3, 3, 2, 2, 1, 1]);
    // No 6th-level slot until level 11.
    expect(FULL_CASTER[9]?.length).toBe(5);
    expect(FULL_CASTER[10]?.length).toBe(6);
  });

  it('half casters get nothing at level 1 and cap at 5th-level slots', () => {
    expect(HALF_CASTER[0]).toEqual([]);
    expect(HALF_CASTER[1]).toEqual([2]);
    expect(HALF_CASTER[19]).toEqual([4, 3, 3, 3, 2]);
  });

  it('pact magic stays at four slots of fifth level', () => {
    expect(PACT_MAGIC[0]).toEqual({ slots: 1, level: 1 });
    expect(PACT_MAGIC[16]).toEqual({ slots: 4, level: 5 });
  });

  it('a level 5 wizard has 4/3/2 slots', () => {
    const s = sheet({ classes: [{ key: 'wizard', level: 5 }] });
    expect(s.resources['spell_slot.1']?.max).toBe(4);
    expect(s.resources['spell_slot.2']?.max).toBe(3);
    expect(s.resources['spell_slot.3']?.max).toBe(2);
    expect(s.resources['spell_slot.4']).toBeUndefined();
  });

  it('warlock slots recharge on a short rest, unlike everyone else', () => {
    const warlock = sheet({ classes: [{ key: 'warlock', level: 11 }] });
    expect(warlock.resources.pact_slot?.max).toBe(3);
    expect(warlock.resources.pact_slot?.recharge).toBe('short-rest');
    expect(warlock.resources.pact_slot?.tier).toBe(5);

    const wizard = sheet({ classes: [{ key: 'wizard', level: 11 }] });
    expect(wizard.resources['spell_slot.1']?.recharge).toBe('long-rest');
  });
});

describe('hand-verified characters', () => {
  it('level 5 high elf wizard', () => {
    const s = sheet({
      attributes: { int: 16 },
      taken: ['elf-high'],
      classes: [{ key: 'wizard', subclass: 'wizard-evocation', level: 5 }],
    });

    // d6 hit die: 8 at first level, then four levels of 4 + CON 2.
    expect(s.stats['hp.max']?.value).toBe(32);
    // High elf grants +2 DEX, so 14 becomes 16 and the modifier is +3.
    expect(s.stats.ac?.value).toBe(13);
    // 8 + INT 3 + proficiency 3. The elf's +1 INT takes 16 to 17, still +3.
    expect(s.stats['spell.save_dc']?.value).toBe(14);
    expect(s.stats['spell.prepared_max']?.value).toBe(8);
  });

  it('level 10 wood elf monk, unarmoured', () => {
    const s = sheet({
      attributes: { dex: 18, wis: 16 },
      taken: ['elf-wood'],
      classes: [{ key: 'monk', subclass: 'monk-open-hand', level: 10 }],
    });

    // Unarmored Defense is DEX + WIS for a monk, not DEX + CON.
    expect(s.stats.ac?.value).toBe(18);
    // Wood elf 35, plus Unarmored Movement at 2, 6, and 10.
    expect(s.stats.speed?.value).toBe(55);
    expect(s.resources.ki?.max).toBe(10);
  });

  it('level 13 rogue sneak attack scales every odd level', () => {
    const s = sheet({
      attributes: { dex: 18 },
      taken: ['halfling-lightfoot'],
      classes: [{ key: 'rogue', subclass: 'rogue-thief', level: 13 }],
    });
    expect(s.stats['sneak_attack.dice']?.value).toBe(7);
    expect(s.stats.proficiency_bonus?.value).toBe(5);
  });

  it('paladin Aura of Protection reaches every saving throw', () => {
    const before = sheet({
      attributes: { str: 18, cha: 16 },
      taken: ['dragonborn'],
      classes: [{ key: 'paladin', subclass: 'paladin-devotion', level: 5 }],
    });
    const after = sheet({
      attributes: { str: 18, cha: 16 },
      taken: ['dragonborn'],
      classes: [{ key: 'paladin', subclass: 'paladin-devotion', level: 6 }],
    });

    // The aura arrives at 6 and adds the paladin's Charisma modifier.
    expect(after.stats['save.wis']!.value - before.stats['save.wis']!.value).toBe(3);
  });

  it('barbarian Unarmored Defense competes with armour rather than stacking', () => {
    const build = {
      attributes: { con: 18, dex: 14 },
      taken: ['half-orc'],
      classes: [{ key: 'barbarian', subclass: 'barbarian-berserker', level: 5 }],
    };

    // 10 + DEX 2 + CON 4.
    expect(sheet(build).stats.ac?.value).toBe(16);
    // Chain mail is 16 flat and wins on being equal-or-higher; the unarmoured
    // calculation switches itself off rather than adding to it.
    const armoured = sheet({ ...build, inventory: [{ key: 'chain-mail', equipped: true }] });
    expect(armoured.stats.ac?.value).toBe(16);
  });
});

describe('armour', () => {
  const wearing = (key: string, dex: number) =>
    sheet({
      attributes: { dex },
      classes: [{ key: 'fighter', level: 1 }],
      inventory: [{ key, equipped: true }],
    });

  it('light armour adds all of Dexterity', () => {
    // Studded leather 12 + DEX 4.
    expect(wearing('studded-leather', 18).stats.ac?.value).toBe(16);
  });

  it('medium armour caps the Dexterity bonus at +2', () => {
    // Half plate 15 + 2, not 15 + 4.
    expect(wearing('half-plate', 18).stats.ac?.value).toBe(17);
    // Below the cap it is the real modifier, not a flat +2.
    expect(wearing('half-plate', 12).stats.ac?.value).toBe(16);
  });

  it('heavy armour ignores Dexterity entirely', () => {
    expect(wearing('plate', 18).stats.ac?.value).toBe(18);
    expect(wearing('plate', 6).stats.ac?.value).toBe(18);
  });

  it('heavy armour costs 10 feet of speed below its Strength requirement', () => {
    const weak = sheet({
      attributes: { str: 12, dex: 10 },
      taken: ['human'],
      classes: [{ key: 'fighter', level: 1 }],
      inventory: [{ key: 'plate', equipped: true }],
    });
    const strong = sheet({
      attributes: { str: 16, dex: 10 },
      taken: ['human'],
      classes: [{ key: 'fighter', level: 1 }],
      inventory: [{ key: 'plate', equipped: true }],
    });

    // Human is +1 to everything, so 12 becomes 13 — still short of 15.
    expect(weak.stats.speed?.value).toBe(20);
    expect(strong.stats.speed?.value).toBe(30);
  });

  it('marks the armour that hampers stealth, and only that armour', () => {
    expect(wearing('half-plate', 14).disadvantage['skill.stealth']).toBeDefined();
    expect(wearing('breastplate', 14).disadvantage['skill.stealth']).toBeUndefined();
  });

  it('covers every SRD armour and weapon', () => {
    const items = dnd5e2014.entities.filter((e) => e.type === 'item');
    const armour = items.filter((e) => e.data?.slot === 'armour');
    const weapons = items.filter((e) => e.data?.slot === 'weapon');

    expect(armour).toHaveLength(12);
    expect(weapons).toHaveLength(37);
  });
});

describe('magic items', () => {
  const fighter = {
    attributes: { con: 14, dex: 10 },
    classes: [{ key: 'fighter', level: 1 }],
  };

  it('Bracers of Defense apply only unarmoured and unshielded', () => {
    const bare = sheet({ ...fighter, inventory: [{ key: 'bracers-of-defense', attuned: true }] });
    expect(bare.stats.ac?.value).toBe(12);

    const shielded = sheet({
      ...fighter,
      inventory: [
        { key: 'bracers-of-defense', attuned: true },
        { key: 'shield', equipped: true },
      ],
    });
    // 10 + shield 2. The bracers switch themselves off rather than adding.
    expect(shielded.stats.ac?.value).toBe(12);
  });

  it('two sources of deflection do not stack', () => {
    const one = sheet({ ...fighter, inventory: [{ key: 'ring-of-protection', attuned: true }] });
    const both = sheet({
      ...fighter,
      inventory: [
        { key: 'ring-of-protection', attuned: true },
        { key: 'cloak-of-protection', attuned: true },
      ],
    });

    // Same bonus type, so the larger wins. Wearing the second changes nothing,
    // which is the assertion that matters — the absolute values also depend on
    // the character's own modifiers.
    expect(both.stats.ac?.value).toBe(one.stats.ac?.value);
    expect(both.stats['save.wis']?.value).toBe(one.stats['save.wis']?.value);
    expect(one.stats.ac?.value).toBe(11);
  });

  it('an Amulet of Health raises a low Constitution and never lowers a high one', () => {
    const raised = sheet({
      attributes: { con: 8 },
      classes: [{ key: 'fighter', level: 1 }],
      inventory: [{ key: 'amulet-of-health', attuned: true }],
    });
    expect(raised.stats['attr.con.score']?.value).toBe(19);

    const alreadyBetter = sheet({
      attributes: { con: 20 },
      classes: [{ key: 'fighter', level: 1 }],
      inventory: [{ key: 'amulet-of-health', attuned: true }],
    });
    expect(alreadyBetter.stats['attr.con.score']?.value).toBe(20);
  });
});

describe('weapons', () => {
  it('finesse weapons record that either ability may be used', () => {
    const s = sheet({
      classes: [{ key: 'rogue', level: 1 }],
      inventory: [
        { key: 'rapier', equipped: true },
        { key: 'greatsword', equipped: true },
        { key: 'longbow', equipped: true },
      ],
    });
    const attacks = Object.fromEntries(
      s.grants.filter((g) => g.category === 'attack').map((g) => [g.target, g.data]),
    );

    expect(attacks.rapier?.ability).toBe('best');
    expect(attacks.greatsword?.ability).toBe('str');
    expect(attacks.longbow?.ability).toBe('dex');
    expect(attacks.greatsword?.damage).toBe('2d6');
  });
});

describe('ability score maxima', () => {
  it('caps an ordinary character at 20', () => {
    // Human adds +1 to everything, so 20 would otherwise become 21.
    const s = sheet({
      attributes: { str: 20 },
      taken: ['human'],
      classes: [{ key: 'fighter', level: 1 }],
    });
    expect(s.stats['attr.str.score']?.value).toBe(20);
    expect(s.stats['attr.str.mod']?.value).toBe(5);
  });

  it('Primal Champion raises the maximum, not just the score', () => {
    // Without raising the cap this would clamp to 20 and the feature would do
    // nothing for a barbarian who was already there.
    const s = sheet({
      attributes: { str: 20, con: 20 },
      taken: ['half-orc'],
      classes: [{ key: 'barbarian', subclass: 'barbarian-berserker', level: 20 }],
    });
    expect(s.stats['attr.str.score']?.value).toBe(24);
    expect(s.stats['attr.str.mod']?.value).toBe(7);
  });

  it('applies the cap without anyone taking a rules entity', () => {
    // System-wide rules are not entities. Putting them on one would mean they
    // silently never applied, because nobody selects "the rules".
    const s = sheet({ attributes: { str: 20 }, taken: ['human'], classes: [] });
    expect(s.stats['attr.str.score']?.value).toBe(20);
  });
});
