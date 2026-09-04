import { describe, expect, it } from 'vitest';
import { type BoundEffect, type Effect, bind } from './effect.js';
import { Formula } from './formula/index.js';
import { type Predicate, always, expression, flag } from './predicate.js';
import { resolve } from './resolve.js';
import { formatTrace } from './stacking.js';

/**
 * Golden tests. Known inputs mapped to expected derived output.
 *
 * These are the engine's safety net: every rules bug found later becomes a
 * permanent case here. See PLAN.md §17.
 *
 * The second suite matters as much as the first. It builds a system with no 5e
 * concepts in it at all — no abilities, no AC, no spell slots, no levels — and
 * runs it through the same engine. If that ever needs a special case, the
 * central architectural bet has been lost.
 */

const f = (source: string | number) => Formula.parse(String(source));

let n = 0;
const from = (
  name: string,
  effect: Effect,
  when: Predicate = always,
  detail?: string,
): BoundEffect =>
  bind(effect, { id: `e${n++}`, name, ...(detail !== undefined ? { detail } : {}) }, when);

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

describe('golden: the AC example from PLAN.md', () => {
  const sheet = resolve({
    facts: { 'attr.dex.score': 16 },
    flags: ['wearing-armour', 'concentrating'],
    effects: [
      from('Dexterity', numeric('attr.dex.mod', 'set', 'floor((attr.dex.score - 10) / 2)')),
      from('Studded Leather', numeric('ac', 'set', 11)),
      from('Dexterity', numeric('ac', 'add', 'attr.dex.mod')),
      from('Ring of Protection', numeric('ac', 'add', 1, 'deflection'), always, 'attuned'),
      from(
        'Defense fighting style',
        numeric('ac', 'add', 1),
        flag('wearing-armour'),
        'wearing armor',
      ),
      from('Shield of Faith', numeric('ac', 'add', 2), flag('concentrating'), 'concentration'),
    ],
  });

  it('computes 18', () => {
    // 11 armour + 3 DEX + 1 deflection + 1 fighting style + 2 Shield of Faith.
    expect(sheet.stats.ac?.value).toBe(18);
  });

  it('attributes every point', () => {
    const applied = sheet.stats.ac!.trace.filter((entry) => entry.applied);
    expect(applied.map((e) => [e.sourceName, e.amount])).toEqual([
      ['Studded Leather', 11],
      ['Dexterity', 3],
      ['Defense fighting style', 1],
      ['Shield of Faith', 2],
      ['Ring of Protection', 1],
    ]);
  });

  it('renders a trace a player can read', () => {
    expect(formatTrace('AC', sheet.stats.ac!)).toMatchInlineSnapshot(`
      "AC 18
        11  Studded Leather
        +3  Dexterity
        +1  Defense fighting style  [wearing armor]
        +2  Shield of Faith  [concentration]
        +1  Ring of Protection  [attuned]"
    `);
  });

  it('drops the fighting style bonus once the armour comes off', () => {
    const unarmoured = resolve({
      facts: { 'attr.dex.score': 16 },
      flags: ['concentrating'],
      effects: [
        from('Dexterity', numeric('attr.dex.mod', 'set', 'floor((attr.dex.score - 10) / 2)')),
        from('Studded Leather', numeric('ac', 'set', 11)),
        from('Dexterity', numeric('ac', 'add', 'attr.dex.mod')),
        from('Defense fighting style', numeric('ac', 'add', 1), flag('wearing-armour')),
        from('Shield of Faith', numeric('ac', 'add', 2), flag('concentrating')),
      ],
    });
    expect(unarmoured.stats.ac?.value).toBe(16);
  });
});

describe('golden: a system with no 5e concepts in it', () => {
  /**
   * Jujutsu Kaisen, per PLAN.md §2. Attributes, progression, resources, and
   * powers are all replaced; nothing here is an ability score, an AC, a spell
   * slot, or a class level. Grades are a named progression track, cursed energy
   * is a flat pool, and the technique is character-scoped content.
   */
  const GRADES = ['grade-4', 'grade-3', 'grade-2', 'grade-1', 'special-grade'];

  const sheet = resolve({
    facts: {
      'attr.cursed-energy.raw': 42,
      'attr.body.raw': 30,
      'grade.rank': GRADES.indexOf('grade-1'),
    },
    flags: ['domain-active'],
    effects: [
      // Attributes derive from raw values on a curve this system invented.
      from(
        'Cursed Energy',
        numeric('attr.cursed-energy', 'set', 'floor(attr.cursed-energy.raw / 3)'),
      ),
      from('Body', numeric('attr.body', 'set', 'floor(attr.body.raw / 3)')),

      // Progression is a named rank, and it feeds the resource pool.
      from('Grade', numeric('output', 'set', 'attr.cursed-energy * (grade.rank + 1)')),

      // A flat pool, not tiered slots.
      from('Cursed Energy Pool', {
        kind: 'resource',
        target: 'cursed-energy',
        max: f('attr.cursed-energy * 10 + grade.rank * 5'),
        recharge: 'long-rest',
      }),

      // Character-unique technique. This entity exists for one person only.
      from('Limitless', {
        kind: 'grant',
        category: 'technique',
        target: 'limitless',
        data: { innate: true, scope: 'character' },
      }),

      // A domain expansion: a large conditional bonus with a sure-hit rider.
      from('Domain: Infinite Void', numeric('output', 'add', 20), flag('domain-active')),
      from(
        'Domain: Infinite Void',
        { kind: 'roll-bias', target: 'technique', bias: 'advantage' },
        flag('domain-active'),
      ),

      // A binding vow: permanent power for a permanent cost.
      from('Binding Vow: Frailty', numeric('output', 'add', 10)),
      from('Binding Vow: Frailty', numeric('attr.body', 'cap', 4)),

      // Rank gating, expressed with the same predicate machinery as `level >= 5`.
      from(
        'Reverse Cursed Technique',
        numeric('healing', 'set', 15),
        expression('grade.rank >= 3'),
      ),
    ],
  });

  it('derives custom attributes with no ability scores anywhere', () => {
    expect(sheet.stats['attr.cursed-energy']?.value).toBe(14);
  });

  it('computes a resource pool from a custom progression track', () => {
    // 14 * 10 + 3 * 5
    expect(sheet.resources['cursed-energy']?.max).toBe(155);
  });

  it('applies a domain expansion as a conditional bonus', () => {
    // (14 * 4) + 20 domain + 10 vow
    expect(sheet.stats.output?.value).toBe(86);
    expect(sheet.advantage.technique).toHaveLength(1);
  });

  it('lets a binding vow cap an attribute permanently', () => {
    expect(sheet.stats['attr.body']?.value).toBe(4);
    const capEntry = sheet.stats['attr.body']!.trace.find((e) => e.operation === 'cap');
    expect(capEntry?.applied).toBe(true);
  });

  it('gates a technique behind a named rank', () => {
    expect(sheet.stats.healing?.value).toBe(15);
  });

  it('carries character-scoped content through as a grant', () => {
    expect(sheet.grants.find((g) => g.target === 'limitless')?.data).toEqual({
      innate: true,
      scope: 'character',
    });
  });

  it('closes the domain and the bonus goes away', () => {
    const closed = resolve({
      facts: { 'attr.cursed-energy.raw': 42, 'grade.rank': 3 },
      flags: [],
      effects: [
        from(
          'Cursed Energy',
          numeric('attr.cursed-energy', 'set', 'floor(attr.cursed-energy.raw / 3)'),
        ),
        from('Grade', numeric('output', 'set', 'attr.cursed-energy * (grade.rank + 1)')),
        from('Domain: Infinite Void', numeric('output', 'add', 20), flag('domain-active')),
      ],
    });
    expect(closed.stats.output?.value).toBe(56);
    expect(closed.advantage.technique).toBeUndefined();
  });

  it('resolves the whole sheet with no diagnostics', () => {
    expect(sheet.diagnostics).toEqual([]);
  });
});
