import { describe, expect, it } from 'vitest';
import { type EvaluatedNumericEffect, stackNumeric } from './stacking.js';

let counter = 0;
const effect = (
  operation: EvaluatedNumericEffect['operation'],
  amount: number,
  extra: Partial<EvaluatedNumericEffect> = {},
): EvaluatedNumericEffect => ({
  operation,
  amount,
  sourceId: `s${counter++}`,
  sourceName: extra.sourceName ?? `Source ${counter}`,
  ...extra,
});

const applied = (result: ReturnType<typeof stackNumeric>) =>
  result.trace.filter((entry) => entry.applied).map((entry) => entry.sourceName);

describe('additive stacking', () => {
  it('sums untyped bonuses', () => {
    const result = stackNumeric([effect('add', 2), effect('add', 3)], { base: 10 });
    expect(result.value).toBe(15);
  });

  it('takes only the largest within a named bonus type', () => {
    const result = stackNumeric(
      [
        effect('add', 1, { bonusType: 'deflection', sourceName: 'Ring of Protection' }),
        effect('add', 3, { bonusType: 'deflection', sourceName: 'Cloak of Displacement' }),
      ],
      { base: 10 },
    );
    expect(result.value).toBe(13);
    expect(applied(result)).toEqual(['Base', 'Cloak of Displacement']);
  });

  it('explains why the loser did not apply', () => {
    const result = stackNumeric([
      effect('add', 1, { bonusType: 'deflection', sourceName: 'Ring' }),
      effect('add', 3, { bonusType: 'deflection', sourceName: 'Cloak' }),
    ]);
    const suppressed = result.trace.find((entry) => !entry.applied);
    expect(suppressed?.sourceName).toBe('Ring');
    expect(suppressed?.suppressedBy).toContain('Cloak');
  });

  it('stacks different bonus types with each other', () => {
    const result = stackNumeric(
      [
        effect('add', 2, { bonusType: 'deflection' }),
        effect('add', 3, { bonusType: 'natural-armour' }),
      ],
      { base: 10 },
    );
    expect(result.value).toBe(15);
  });

  it('stacks untyped bonuses alongside typed ones', () => {
    const result = stackNumeric(
      [effect('add', 1), effect('add', 1), effect('add', 5, { bonusType: 'deflection' })],
      { base: 10 },
    );
    expect(result.value).toBe(17);
  });
});

describe('set operations', () => {
  it('replaces the base, largest winning', () => {
    // Armour versus Unarmored Defense: neither knows the other exists, and the
    // better calculation simply wins.
    const result = stackNumeric([
      effect('set', 14, { sourceName: 'Studded Leather' }),
      effect('set', 16, { sourceName: 'Unarmored Defense' }),
    ]);
    expect(result.value).toBe(16);
    expect(applied(result)).toEqual(['Unarmored Defense']);
  });

  it('applies additive bonuses on top of the winning set', () => {
    const result = stackNumeric([effect('set', 14), effect('add', 2)]);
    expect(result.value).toBe(16);
  });

  it('ignores the configured base when a set wins', () => {
    const result = stackNumeric([effect('set', 14)], { base: 10 });
    expect(result.value).toBe(14);
  });
});

describe('floors and caps', () => {
  it('raises a value below the floor', () => {
    expect(stackNumeric([effect('add', 3), effect('floor', 10)]).value).toBe(10);
  });

  it('leaves a value already above the floor alone', () => {
    const result = stackNumeric([effect('add', 15), effect('floor', 10)]);
    expect(result.value).toBe(15);
    expect(result.trace.find((e) => e.operation === 'floor')?.applied).toBe(false);
  });

  it('clamps a value above the cap', () => {
    expect(stackNumeric([effect('add', 30), effect('cap', 20)]).value).toBe(20);
  });

  it('takes the largest floor and the smallest cap', () => {
    expect(stackNumeric([effect('floor', 5), effect('floor', 8)]).value).toBe(8);
    expect(stackNumeric([effect('add', 30), effect('cap', 25), effect('cap', 20)]).value).toBe(20);
  });

  it('lets the floor win when a cap contradicts it', () => {
    // Contradictory content. Picking silently would hide an authoring bug, so
    // the floor wins and the resolver raises a diagnostic.
    const result = stackNumeric([effect('floor', 10), effect('cap', 5)]);
    expect(result.value).toBe(10);
    const cap = result.trace.find((e) => e.operation === 'cap');
    expect(cap?.applied).toBe(false);
    expect(cap?.suppressedBy).toContain('floor');
  });
});

describe('determinism', () => {
  it('is stable regardless of effect order', () => {
    const effects = [
      effect('set', 11, { sourceName: 'Armour' }),
      effect('add', 3, { sourceName: 'Dex' }),
      effect('add', 1, { bonusType: 'deflection', sourceName: 'Ring' }),
      effect('add', 2, { bonusType: 'deflection', sourceName: 'Cloak' }),
      effect('cap', 20, { sourceName: 'Cap' }),
    ];
    const forward = stackNumeric(effects).value;
    const reversed = stackNumeric([...effects].reverse()).value;
    expect(forward).toBe(reversed);
    expect(forward).toBe(16);
  });
});
