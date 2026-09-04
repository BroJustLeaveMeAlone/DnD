import type { CharacterBuild } from '@ttrpg/rules-engine';
import { formatTrace } from '@ttrpg/rules-engine';
import { describe, expect, it } from 'vitest';
import { buildSheet } from './index.js';
import { dnd5e2014 } from './dnd5e-2014.js';
import { dnd5e2024 } from './dnd5e-2024.js';

/**
 * Golden tests for both editions.
 *
 * The edition-difference suite is the important one. Two modules encoding
 * genuinely different rules through one unchanged engine is the forcing
 * function for the whole architecture — if either needed a special case in the
 * engine, the central bet would have failed.
 */

const fighter5 = (): CharacterBuild => ({
  attributes: { str: 16, dex: 14, con: 15, int: 10, wis: 12, cha: 8 },
  taken: ['human', 'soldier', 'style-defense'],
  classes: [{ key: 'fighter', subclass: 'fighter-champion', level: 5 }],
  inventory: [
    { key: 'chain-mail', equipped: true },
    { key: 'shield', equipped: true },
    { key: 'longsword', equipped: true },
    { key: 'ring-of-protection', attuned: true },
  ],
});

describe('2014: level 5 human fighter', () => {
  const sheet = buildSheet(dnd5e2014, fighter5());

  it('applies the 2014 human +1 to every ability, and it reaches the modifier', () => {
    // The whole point: a score increase is worthless if the derived modifier
    // still uses the raw chosen number. STR 16 + 1 human = 17, mod +3.
    expect(sheet.stats['attr.str.score']?.value).toBe(17);
    expect(sheet.stats['attr.str.mod']?.value).toBe(3);

    // CON 15 + 1 = 16, mod +3 — the increase crosses a modifier boundary here,
    // so a broken pipeline would show +2.
    expect(sheet.stats['attr.con.score']?.value).toBe(16);
    expect(sheet.stats['attr.con.mod']?.value).toBe(3);
  });

  it('computes proficiency bonus from total level', () => {
    expect(sheet.stats.proficiency_bonus?.value).toBe(3);
  });

  it('stacks chain mail, shield, ring, and fighting style into AC', () => {
    // 16 chain mail + 2 shield + 1 deflection + 1 Defense style
    expect(sheet.stats.ac?.value).toBe(20);
  });

  it('gives Extra Attack at level 5', () => {
    expect(sheet.stats.attacks?.value).toBe(2);
  });

  it('gives the Champion improved critical range', () => {
    expect(sheet.stats['crit.range']?.value).toBe(19);
  });

  it('adds proficiency to proficient saves and not others', () => {
    // STR save: mod + prof + ring. CHA save: mod + ring only.
    const str = sheet.stats['save.str']!.value;
    const cha = sheet.stats['save.cha']!.value;
    expect(str - cha).toBe(3 + (3 - -1) - 1 + 1 - 3 + 3);
    expect(sheet.proficiencies['save.str']?.level).toBe('proficient');
    expect(sheet.proficiencies['save.cha']).toBeUndefined();
  });

  it('applies background skill proficiencies', () => {
    expect(sheet.proficiencies['skill.athletics']?.level).toBe('proficient');
    expect(sheet.proficiencies['skill.intimidation']?.level).toBe('proficient');
  });

  it('resolves with no diagnostics', () => {
    expect(sheet.diagnostics).toEqual([]);
  });
});

describe('2024: the same character, encoded independently', () => {
  const sheet = buildSheet(dnd5e2024, fighter5());

  it('gets ability increases from the background, not the species', () => {
    // Soldier grants +2 STR / +1 CON. The 2024 human grants no scores at all,
    // so STR is 16 + 2 = 18 rather than 2014's 16 + 1 = 17.
    expect(sheet.stats['attr.str.score']?.value).toBe(18);
    expect(sheet.stats['attr.str.mod']?.value).toBe(4);

    // Untouched abilities keep exactly what the player chose.
    expect(sheet.stats['attr.wis.score']?.value).toBe(12);

    const legacy = buildSheet(dnd5e2014, fighter5());
    expect(legacy.stats['attr.wis.score']?.value).toBe(13); // 2014 human +1
    expect(sheet.diagnostics).toEqual([]);
  });

  it('grants weapon masteries, which do not exist in 2014', () => {
    expect(sheet.stats['weapon_mastery.count']?.value).toBe(4);
    expect(dnd5e2014.derived.find((d) => d.key === 'weapon_mastery.count')).toBeUndefined();
  });

  it('grants a background feat, which 2014 backgrounds never do', () => {
    expect(sheet.grants.some((g) => g.category === 'feat' && g.target === 'savage-attacker')).toBe(
      true,
    );
    const legacy = buildSheet(dnd5e2014, fighter5());
    expect(legacy.grants.some((g) => g.category === 'feat')).toBe(false);
  });

  it('gives Champion an initiative bonus 2014 has no equivalent for', () => {
    // 2024 Champion adds proficiency to initiative at level 3.
    expect(sheet.stats.initiative?.value).toBe(2 + 3);
    expect(buildSheet(dnd5e2014, fighter5()).stats.initiative?.value).toBe(2);
  });

  it('gives Second Wind more uses than 2014', () => {
    expect(sheet.resources['second-wind']?.max).toBe(3);
    expect(buildSheet(dnd5e2014, fighter5()).resources['second-wind']?.max).toBe(1);
  });
});

describe('edition differences that must not be shared code', () => {
  const dwarfWizard = (): CharacterBuild => ({
    attributes: { str: 8, dex: 14, con: 14, int: 16, wis: 12, cha: 10 },
    taken: ['sage'],
    classes: [{ key: 'wizard', level: 5 }],
    inventory: [],
  });

  it('2014 dwarf moves 25 feet, 2024 dwarf moves 30', () => {
    const legacy = buildSheet(dnd5e2014, { ...dwarfWizard(), taken: ['dwarf-hill', 'sage'] });
    const modern = buildSheet(dnd5e2024, { ...dwarfWizard(), taken: ['dwarf', 'sage'] });
    expect(legacy.stats.speed?.value).toBe(25);
    expect(modern.stats.speed?.value).toBe(30);
  });

  it('2024 dwarf darkvision doubled to 120 feet', () => {
    const legacy = buildSheet(dnd5e2014, { ...dwarfWizard(), taken: ['dwarf-hill', 'sage'] });
    const modern = buildSheet(dnd5e2024, { ...dwarfWizard(), taken: ['dwarf', 'sage'] });
    const range = (s: typeof legacy) =>
      s.grants.find((g) => g.category === 'sense' && g.target === 'darkvision')?.data?.range;
    expect(range(legacy)).toBe(60);
    expect(range(modern)).toBe(120);
  });

  it('wizards prepare INT + level in 2014 and a flat table in 2024', () => {
    const legacy = buildSheet(dnd5e2014, dwarfWizard());
    const modern = buildSheet(dnd5e2024, dwarfWizard());
    // 2014: INT mod (3) + 5. 2024: 3 + 5.
    expect(legacy.stats['spell.prepared_max']?.value).toBe(8);
    expect(modern.stats['spell.prepared_max']?.value).toBe(8);
    // Same at this level by coincidence; they diverge when INT changes.
    const dumbWizard = { ...dwarfWizard(), attributes: { ...dwarfWizard().attributes, int: 10 } };
    expect(buildSheet(dnd5e2014, dumbWizard).stats['spell.prepared_max']?.value).toBe(5);
    expect(buildSheet(dnd5e2024, dumbWizard).stats['spell.prepared_max']?.value).toBe(8);
  });

  it('2014 exhaustion is a ladder, 2024 is one scaling penalty', () => {
    expect(dnd5e2014.entities.filter((e) => e.key.startsWith('exhaustion')).length).toBeGreaterThan(
      0,
    );
    const modern = dnd5e2024.entities.find((e) => e.key === 'exhaustion');
    expect(modern?.grants?.[0]?.effects.length).toBe(2);

    const sheet = buildSheet(dnd5e2024, {
      ...dwarfWizard(),
      flags: [],
    });
    // With no exhaustion fact the predicate cannot be decided, so it stays off.
    expect(sheet.stats.d20_test?.value).toBe(0);
  });
});

describe('competing AC calculations resolve without knowing about each other', () => {
  const wizard = (inventory: CharacterBuild['inventory']): CharacterBuild => ({
    attributes: { str: 8, dex: 16, con: 14, int: 16, wis: 12, cha: 10 },
    taken: ['sage'],
    classes: [{ key: 'wizard', level: 5 }],
    inventory,
  });

  it('Mage Armor beats no armour', () => {
    const sheet = buildSheet(dnd5e2024, { ...wizard([]), taken: ['sage', 'mage-armour'] });
    // 13 + 3 DEX, beating the unarmoured 10 + 3.
    expect(sheet.stats.ac?.value).toBe(16);
  });

  it('chain mail beats Mage Armor, and Mage Armor switches itself off', () => {
    const sheet = buildSheet(dnd5e2024, {
      ...wizard([{ key: 'chain-mail', equipped: true }]),
      taken: ['sage', 'mage-armour'],
    });
    expect(sheet.stats.ac?.value).toBe(16);
    const mageArmour = sheet.stats.ac!.trace.find((e) => e.sourceName === 'Mage Armor');
    expect(mageArmour?.applied).toBe(false);
    expect(mageArmour?.suppressedBy).toBe('its condition is not met');
  });

  it('an unequipped item stays in the trace with its condition unmet', () => {
    const sheet = buildSheet(dnd5e2024, wizard([{ key: 'shield', equipped: false }]));
    const shield = sheet.stats.ac!.trace.find((e) => e.sourceName === 'Shield');
    expect(shield?.applied).toBe(false);
    expect(shield?.suppressedBy).toBe('its condition is not met');
  });
});

describe('a plain character with no magic items', () => {
  // The 2014/2024 fighter fixtures all carry a Ring of Protection, which is the
  // only thing targeting `save.all`. A character without one must still resolve
  // cleanly — otherwise every save breaks for the common case.
  const plain = (): CharacterBuild => ({
    attributes: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    taken: ['human'],
    classes: [{ key: 'fighter', level: 1 }],
    inventory: [{ key: 'chain-mail', equipped: true }],
  });

  it.each([
    ['2014', dnd5e2014],
    ['2024', dnd5e2024],
  ])('%s resolves with no diagnostics', (_edition, module) => {
    expect(buildSheet(module, plain()).diagnostics).toEqual([]);
  });

  it('computes saves without any all-saves bonus present', () => {
    const sheet = buildSheet(dnd5e2014, plain());
    // 2014 human +1 to CON -> 11, mod +0. Fighter is proficient, +2 at level 1.
    expect(sheet.stats['save.con']?.value).toBe(2);
    // Not proficient, no bonus.
    expect(sheet.stats['save.cha']?.value).toBe(0);
  });

  it('does not emit chain mail twice when Strength is too low to wear it', () => {
    const sheet = buildSheet(dnd5e2014, plain());
    const entries = sheet.stats.ac!.trace.filter((t) => t.sourceName === 'Chain Mail');
    expect(entries).toHaveLength(1);
    expect(sheet.grants.filter((g) => g.target === 'armour.heavy')).toHaveLength(1);
    // STR 11 < 13, so the speed penalty applies: 30 - 10.
    expect(sheet.stats.speed?.value).toBe(20);
  });
});

describe('provenance on a real character', () => {
  it('renders an AC trace a player can read', () => {
    const sheet = buildSheet(dnd5e2014, fighter5());
    expect(formatTrace('AC', sheet.stats.ac!)).toMatchInlineSnapshot(`
      "AC 20
        16  Chain Mail
        +1  Defense fighting style  [wearing armor]
        +2  Shield
        +1  Ring of Protection  [attuned]"
    `);
  });
});
