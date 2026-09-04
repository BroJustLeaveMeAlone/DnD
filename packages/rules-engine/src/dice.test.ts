import { describe, expect, it } from 'vitest';
import {
  DiceSyntaxError,
  type RandomSource,
  parseDice,
  roll,
  seededRandom,
  tryParseDice,
  withAdvantage,
  withDisadvantage,
} from './dice.js';

/** Returns the given faces in order, so a "roll" is fully determined. */
const faces = (...values: number[]): RandomSource => {
  let i = 0;
  return () => {
    const value = values[i % values.length]!;
    i += 1;
    // roll() computes floor(random() * sides) + 1, so invert that.
    return (value - 1) / 1000;
  };
};

/** Faces for a specific die size. */
const facesOf = (sides: number, ...values: number[]): RandomSource => {
  let i = 0;
  return () => {
    const value = values[i % values.length]!;
    i += 1;
    return (value - 0.5) / sides;
  };
};

describe('parsing', () => {
  it('parses a bare die', () => {
    expect(parseDice('d20')).toEqual([{ kind: 'dice', count: 1, sides: 20, sign: 1 }]);
  });

  it('parses count and sides', () => {
    expect(parseDice('3d6')[0]).toMatchObject({ count: 3, sides: 6 });
  });

  it('parses constants and signs', () => {
    const terms = parseDice('2d6 + 3 - 1');
    expect(terms).toHaveLength(3);
    expect(terms[1]).toEqual({ kind: 'constant', value: 3, sign: 1 });
    expect(terms[2]).toEqual({ kind: 'constant', value: 1, sign: -1 });
  });

  it.each([
    ['4d6kh3', { keepHighest: 3 }],
    ['4d6kl1', { keepLowest: 1 }],
    ['4d6dh1', { dropHighest: 1 }],
    ['4d6dl1', { dropLowest: 1 }],
    ['4d6!', { explode: true }],
    ['4d6r1', { reroll: { threshold: 1, once: false } }],
    ['4d6ro1', { reroll: { threshold: 1, once: true } }],
    ['4d6min2', { minimum: 2 }],
    ['4d6max5', { maximum: 5 }],
  ])('parses %s', (source, expected) => {
    expect(parseDice(source)[0]).toMatchObject(expected);
  });

  it.each([
    ['', /Empty expression/],
    ['d', /Expected the number of sides/],
    ['2d6 +', /Expected a number or dice/],
    ['2d6 & 1', /Unexpected/],
    ['4d6kh3kl1', /only one of/],
    ['2d6kh5', /Cannot keep or drop 5 of 2/],
    ['0d6', /at least 1/],
    ['2d0', /at least one side/],
    ['9999d6', /more than 1000 dice/],
    ['1d9999', /more than 1000 sides/],
  ])('rejects %s', (source, pattern) => {
    expect(() => parseDice(source)).toThrow(pattern);
  });

  it('tryParse returns the error rather than throwing', () => {
    const result = tryParseDice('nonsense');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(DiceSyntaxError);
  });
});

describe('rolling', () => {
  it('sums dice and constants', () => {
    const result = roll('2d6+3', { random: facesOf(6, 4, 5) });
    expect(result.total).toBe(12);
  });

  it('subtracts a negative term', () => {
    expect(roll('2d6-2', { random: facesOf(6, 4, 5) }).total).toBe(7);
  });

  it('records every face rolled', () => {
    const result = roll('2d6', { random: facesOf(6, 4, 5) });
    expect(result.terms[0]!.dice.map((d) => d.value)).toEqual([4, 5]);
  });

  it('keeps the highest', () => {
    const result = roll('4d6kh3', { random: facesOf(6, 1, 5, 3, 6) });
    // 1 is dropped: 5 + 3 + 6
    expect(result.total).toBe(14);
    const dropped = result.terms[0]!.dice.filter((d) => !d.kept);
    expect(dropped.map((d) => d.value)).toEqual([1]);
  });

  it('keeps the lowest', () => {
    expect(roll('4d6kl1', { random: facesOf(6, 1, 5, 3, 6) }).total).toBe(1);
  });

  it('drops the lowest', () => {
    // 1 dropped, 5 + 3 + 6
    expect(roll('4d6dl1', { random: facesOf(6, 1, 5, 3, 6) }).total).toBe(14);
  });

  it('reports why a die was not counted', () => {
    const result = roll('2d20kh1', { random: facesOf(20, 8, 17) });
    const dropped = result.terms[0]!.dice.find((d) => !d.kept);
    expect(dropped?.reason).toBe('kept-highest');
  });

  it('preserves roll order in the results, not sorted order', () => {
    // A player watching dice land expects them in the order they were thrown.
    const result = roll('4d6kh3', { random: facesOf(6, 1, 5, 3, 6) });
    expect(result.terms[0]!.dice.map((d) => d.value)).toEqual([1, 5, 3, 6]);
  });

  it('rerolls at or below the threshold', () => {
    const result = roll('1d6r1', { random: facesOf(6, 1, 1, 4) });
    expect(result.total).toBe(4);
    expect(result.terms[0]!.dice[0]!.rolls).toEqual([1, 1, 4]);
  });

  it('rerolls only once with ro', () => {
    const result = roll('1d6ro1', { random: facesOf(6, 1, 1, 4) });
    expect(result.total).toBe(1);
    expect(result.terms[0]!.dice[0]!.rolls).toEqual([1, 1]);
  });

  it('explodes on a maximum', () => {
    const result = roll('1d6!', { random: facesOf(6, 6, 6, 2) });
    expect(result.total).toBe(14);
    expect(result.terms[0]!.dice[0]!.rolls).toEqual([6, 6, 2]);
  });

  it('bounds runaway explosions', () => {
    // Every face of a d1 is a maximum, so this would never terminate unbounded.
    const result = roll('1d1!', { random: () => 0 });
    expect(Number.isFinite(result.total)).toBe(true);
    expect(result.terms[0]!.dice[0]!.rolls.length).toBeLessThanOrEqual(101);
  });

  it('clamps with min and max', () => {
    expect(roll('1d6min4', { random: facesOf(6, 1) }).total).toBe(4);
    expect(roll('1d6max3', { random: facesOf(6, 6) }).total).toBe(3);
  });

  it('produces a readable breakdown', () => {
    const result = roll('2d6+3', { random: facesOf(6, 4, 5) });
    expect(result.breakdown).toBe('2d6+3: [4, 5] + 3 = 12');
  });
});

describe('advantage helpers', () => {
  it('builds the right notation', () => {
    expect(withAdvantage(5)).toBe('2d20kh1+5');
    expect(withDisadvantage(-2)).toBe('2d20kl1-2');
    expect(withAdvantage()).toBe('2d20kh1');
  });

  it('advantage keeps the better die and disadvantage the worse', () => {
    const random = () => facesOf(20, 8, 17)();
    expect(roll(withAdvantage(), { random: facesOf(20, 8, 17) }).total).toBe(17);
    expect(roll(withDisadvantage(), { random: facesOf(20, 8, 17) }).total).toBe(8);
    expect(random).toBeDefined();
  });
});

describe('determinism', () => {
  it('the same seed replays the same roll exactly', () => {
    // The shared campaign roll feed depends on this: a client and a server
    // replaying one roll must agree.
    const a = roll('4d6kh3+2', { random: seededRandom(12345) });
    const b = roll('4d6kh3+2', { random: seededRandom(12345) });
    expect(a).toEqual(b);
  });

  it('different seeds diverge', () => {
    const a = roll('20d20', { random: seededRandom(1) });
    const b = roll('20d20', { random: seededRandom(2) });
    expect(a.total).not.toBe(b.total);
  });

  it('stays within the possible range over many rolls', () => {
    const random = seededRandom(99);
    for (let i = 0; i < 200; i += 1) {
      const result = roll('3d6', { random });
      expect(result.total).toBeGreaterThanOrEqual(3);
      expect(result.total).toBeLessThanOrEqual(18);
    }
  });

  it('produces every face of a d6 across enough rolls', () => {
    const random = seededRandom(7);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i += 1) seen.add(roll('1d6', { random }).total);
    expect(seen).toEqual(new Set([1, 2, 3, 4, 5, 6]));
  });

  it('never rolls outside 1..sides', () => {
    const random = seededRandom(3);
    for (let i = 0; i < 500; i += 1) {
      const value = roll('1d20', { random }).total;
      expect(value).toBeGreaterThanOrEqual(1);
      expect(value).toBeLessThanOrEqual(20);
    }
    expect(faces(1)).toBeDefined();
  });
});
