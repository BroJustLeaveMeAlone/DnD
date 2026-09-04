import { describe, expect, it } from 'vitest';
import { type BoundEffect, type Effect, bind } from './effect.js';
import { Formula } from './formula/index.js';
import { type Predicate, always, expression, flag, not } from './predicate.js';
import { resolve } from './resolve.js';

const f = (source: string | number) => Formula.parse(String(source));

const numeric = (
  target: string,
  operation: 'add' | 'set' | 'floor' | 'cap',
  value: string | number,
  bonusType?: string,
): Effect => ({
  kind: 'numeric',
  target,
  operation,
  value: f(value),
  ...(bonusType !== undefined ? { bonusType } : {}),
});

let n = 0;
const from = (name: string, effect: Effect, when: Predicate = always): BoundEffect =>
  bind(effect, { id: `e${n++}`, name }, when);

describe('resolution pipeline', () => {
  it('resolves a stat from facts through a formula', () => {
    const sheet = resolve({
      facts: { 'attr.dex.score': 16 },
      effects: [
        from('Dexterity', numeric('attr.dex.mod', 'set', 'floor((attr.dex.score - 10) / 2)')),
      ],
    });
    expect(sheet.stats['attr.dex.mod']?.value).toBe(3);
  });

  it('resolves stats that depend on other stats, in any declaration order', () => {
    // `ac` is declared before the modifier it depends on. Lazy resolution means
    // authors never have to think about ordering.
    const sheet = resolve({
      facts: { 'attr.dex.score': 16 },
      effects: [
        from('Leather', numeric('ac', 'set', '11 + attr.dex.mod')),
        from('Dexterity', numeric('attr.dex.mod', 'set', 'floor((attr.dex.score - 10) / 2)')),
      ],
    });
    expect(sheet.stats.ac?.value).toBe(14);
  });

  it('prefers a fact over a derived stat of the same name', () => {
    const sheet = resolve({
      facts: { level: 7 },
      effects: [
        from('Wrong', numeric('level', 'set', 1)),
        from('Uses', numeric('uses', 'set', 'level')),
      ],
    });
    expect(sheet.stats.uses?.value).toBe(7);
  });

  it('applies system-provided bases when nothing sets the value', () => {
    const sheet = resolve({
      bases: { speed: 30 },
      effects: [from('Boots', numeric('speed', 'add', 10))],
    });
    expect(sheet.stats.speed?.value).toBe(40);
  });
});

describe('predicates', () => {
  it('drops effects whose predicate is false', () => {
    const sheet = resolve({
      flags: [],
      effects: [from('Rage', numeric('damage', 'add', 2), flag('raging'))],
    });
    expect(sheet.stats.damage?.value).toBe(0);
  });

  it('keeps the stat and explains the absence rather than vanishing', () => {
    // "Why is my rage damage missing?" is answerable only if the gated-off
    // effect stays in the trace.
    const sheet = resolve({
      flags: [],
      effects: [from('Rage', numeric('damage', 'add', 2), flag('raging'))],
    });
    const entry = sheet.stats.damage?.trace.find((e) => e.sourceName === 'Rage');
    expect(entry?.applied).toBe(false);
    expect(entry?.suppressedBy).toBe('its condition is not met');
    expect(entry?.amount).toBe(2);
  });

  it('applies effects whose predicate is true', () => {
    const sheet = resolve({
      flags: ['raging'],
      effects: [from('Rage', numeric('damage', 'add', 2), flag('raging'))],
    });
    expect(sheet.stats.damage?.value).toBe(2);
  });

  it('evaluates expression predicates against facts', () => {
    const build = (level: number) =>
      resolve({
        facts: { level },
        effects: [
          from('Extra Attack', numeric('attacks', 'add', 1), expression('level >= 5')),
          from('Base', numeric('attacks', 'set', 1)),
        ],
      }).stats.attacks?.value;

    expect(build(4)).toBe(1);
    expect(build(5)).toBe(2);
  });

  it('composes predicates', () => {
    const sheet = resolve({
      flags: ['raging'],
      effects: [
        from('Unarmored Defense', numeric('ac', 'set', 13), not(flag('wearing-armour'))),
        from('Plate', numeric('ac', 'set', 18), flag('wearing-armour')),
      ],
    });
    expect(sheet.stats.ac?.value).toBe(13);
  });
});

describe('non-numeric effects', () => {
  it('keeps the highest proficiency level and records the losers', () => {
    const sheet = resolve({
      effects: [
        from('Rogue', { kind: 'proficiency', target: 'skill.stealth', level: 'proficient' }),
        from('Expertise', { kind: 'proficiency', target: 'skill.stealth', level: 'expertise' }),
      ],
    });
    const stealth = sheet.proficiencies['skill.stealth'];
    expect(stealth?.level).toBe('expertise');
    expect(stealth?.trace).toHaveLength(2);
    expect(stealth?.trace.filter((t) => t.applied)).toHaveLength(1);
  });

  it('collects advantage and disadvantage separately', () => {
    const sheet = resolve({
      effects: [
        from('Pack Tactics', { kind: 'roll-bias', target: 'attack', bias: 'advantage' }),
        from('Prone', { kind: 'roll-bias', target: 'attack', bias: 'disadvantage' }),
      ],
    });
    expect(sheet.advantage.attack).toHaveLength(1);
    expect(sheet.disadvantage.attack).toHaveLength(1);
  });

  it('ranks immunity above resistance', () => {
    const sheet = resolve({
      effects: [
        from('Ring', { kind: 'damage-response', target: 'fire', response: 'resistance' }),
        from('Elemental', { kind: 'damage-response', target: 'fire', response: 'immunity' }),
      ],
    });
    expect(sheet.damageResponses.fire).toBe('immunity');
  });

  it('computes resource maxima through formulas', () => {
    const sheet = resolve({
      facts: { level: 5 },
      effects: [
        from('Rage', {
          kind: 'resource',
          target: 'rage',
          max: f('if(level >= 3, 3, 2)'),
          recharge: 'long-rest',
        }),
      ],
    });
    expect(sheet.resources.rage?.max).toBe(3);
    expect(sheet.resources.rage?.recharge).toBe('long-rest');
  });

  it('passes grants through untouched', () => {
    const sheet = resolve({
      effects: [
        from('Darkvision', {
          kind: 'grant',
          category: 'sense',
          target: 'darkvision',
          data: { range: 60 },
        }),
      ],
    });
    expect(sheet.grants[0]?.data).toEqual({ range: 60 });
  });
});

describe('degradation and diagnostics', () => {
  it('detects a circular dependency instead of hanging', () => {
    const sheet = resolve({
      effects: [from('A', numeric('a', 'set', 'b + 1')), from('B', numeric('b', 'set', 'a + 1'))],
    });
    const cycle = sheet.diagnostics.find((d) => d.code === 'circular-dependency');
    expect(cycle).toBeDefined();
    expect(cycle?.message).toMatch(/a -> b -> a|b -> a -> b/);
  });

  it('drops one broken formula without taking the sheet down', () => {
    // A half-configured homebrew item should degrade, not crash.
    const sheet = resolve({
      effects: [
        from('Good', numeric('ac', 'set', 12)),
        from('Broken Homebrew', numeric('ac', 'add', 'nonexistent.thing')),
        from('Also Good', numeric('ac', 'add', 2)),
      ],
    });
    expect(sheet.stats.ac?.value).toBe(14);
    expect(sheet.diagnostics.some((d) => d.code === 'unknown-reference')).toBe(true);
  });

  it('names the source of a broken formula so the author can find it', () => {
    const sheet = resolve({
      effects: [from('Cursed Blade', numeric('ac', 'add', 'missing.stat'))],
    });
    expect(sheet.diagnostics[0]?.message).toContain('Cursed Blade');
  });

  it('warns when a cap contradicts a floor', () => {
    const sheet = resolve({
      effects: [from('Floor', numeric('x', 'floor', 10)), from('Cap', numeric('x', 'cap', 5))],
    });
    expect(sheet.stats.x?.value).toBe(10);
    expect(sheet.diagnostics.some((d) => d.code === 'contradictory-bounds')).toBe(true);
  });
});

describe('determinism', () => {
  it('produces identical output across repeated runs', () => {
    // One set of effects, resolved twice — reusing the same effects is the
    // point, since fresh ones would carry fresh source ids and differ trivially.
    const input = {
      facts: { 'attr.dex.score': 16, level: 5 },
      flags: ['wearing-armour'],
      effects: [
        from('Dex', numeric('attr.dex.mod', 'set', 'floor((attr.dex.score - 10) / 2)')),
        from('Armour', numeric('ac', 'set', '11 + attr.dex.mod')),
        from('Ring', numeric('ac', 'add', 1, 'deflection')),
      ],
    };
    expect(JSON.stringify(resolve(input))).toBe(JSON.stringify(resolve(input)));
  });
});

describe('prototype pollution', () => {
  it.each(['constructor', '__proto__', 'toString', 'valueOf'])(
    'does not resolve `%s` off the prototype chain of the facts object',
    (path) => {
      // Facts come from callers as plain objects. Indexing one directly would
      // hand a formula a live host function for these keys.
      const sheet = resolve({
        facts: {},
        effects: [from('Attacker', numeric('pwned', 'set', path))],
      });
      expect(sheet.stats.pwned?.value).toBe(0);
      expect(sheet.diagnostics.some((d) => d.code === 'unknown-reference')).toBe(true);
    },
  );
});
