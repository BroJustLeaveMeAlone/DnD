import { describe, expect, it } from 'vitest';
import { Formula, FormulaEvaluationError, FormulaSyntaxError, type FormulaScope } from './index.js';

const scope = (values: Record<string, number | boolean>): FormulaScope => ({
  lookup: (path) => values[path],
});

const evaluate = (source: string, values: Record<string, number | boolean> = {}) =>
  Formula.parse(source).evaluate(scope(values));

describe('arithmetic', () => {
  it.each([
    ['1 + 2', 3],
    ['10 - 4', 6],
    ['3 * 4', 12],
    ['10 / 4', 2.5],
    ['10 % 3', 1],
    ['-5', -5],
    ['2 + 3 * 4', 14],
    ['(2 + 3) * 4', 20],
    ['10 - 3 - 2', 5], // left-associative, not 9
    ['2.5 + 0.5', 3],
  ])('%s = %s', (source, expected) => {
    expect(evaluate(source)).toBe(expected);
  });
});

describe('references', () => {
  it('resolves dotted paths', () => {
    expect(evaluate('10 + attr.dex.mod + prof', { 'attr.dex.mod': 3, prof: 2 })).toBe(15);
  });

  it('uses underscores in path segments, not hyphens', () => {
    expect(evaluate('resource.cursed_energy.max', { 'resource.cursed_energy.max': 40 })).toBe(40);
  });

  it('parses `level-1` as subtraction, not as an identifier', () => {
    // The reason hyphens are banned from identifiers. If `-` were an identifier
    // character this would silently become an unknown reference instead of
    // arithmetic, which is a trap in a user-facing formula editor.
    expect(evaluate('level-1', { level: 5 })).toBe(4);
    expect(evaluate('level -1', { level: 5 })).toBe(4);
  });

  it('throws on an unknown reference by default', () => {
    expect(() => evaluate('missing.thing')).toThrow(FormulaEvaluationError);
  });

  it('can substitute a fallback instead', () => {
    const value = Formula.parse('10 + missing').evaluate(scope({}), {
      onMissingReference: () => 0,
    });
    expect(value).toBe(10);
  });

  it('reports every reference it depends on', () => {
    const formula = Formula.parse('floor((attr.str.score - 10) / 2) + prof');
    expect([...formula.references].sort()).toEqual(['attr.str.score', 'prof']);
  });
});

describe('comparison and logic', () => {
  it.each([
    ['5 > 3', true],
    ['3 >= 3', true],
    ['2 < 1', false],
    ['4 == 4', true],
    ['4 != 4', false],
    ['true and false', false],
    ['true or false', true],
    ['not false', true],
    ['5 > 3 and 2 < 4', true],
  ])('%s = %s', (source, expected) => {
    expect(evaluate(source)).toBe(expected);
  });

  it('short-circuits `and`, so a guarded lookup is safe', () => {
    // The right side references something absent; if `and` were strict this
    // would throw instead of returning false.
    expect(evaluate('false and missing.thing > 1')).toBe(false);
  });

  it('short-circuits `or`', () => {
    expect(evaluate('true or missing.thing > 1')).toBe(true);
  });
});

describe('functions', () => {
  it.each([
    ['floor(2.9)', 2],
    ['ceil(2.1)', 3],
    ['abs(-7)', 7],
    ['sign(-3)', -1],
    ['min(4, 2, 9)', 2],
    ['max(4, 2, 9)', 9],
    ['if(1 > 0, 10, 20)', 10],
    ['if(1 > 2, 10, 20)', 20],
  ])('%s = %s', (source, expected) => {
    expect(evaluate(source)).toBe(expected);
  });

  it('rounds half away from zero, not toward positive infinity', () => {
    // Math.round(-2.5) is -2, which is not what a rules author means by
    // "round". Ability modifiers and halved damage both depend on this.
    expect(evaluate('round(2.5)')).toBe(3);
    expect(evaluate('round(-2.5)')).toBe(-3);
  });

  it('does not evaluate the untaken branch of `if`', () => {
    expect(evaluate('if(false, missing.thing, 5)')).toBe(5);
  });

  it('rejects unknown functions at parse time', () => {
    expect(() => Formula.parse('sqrt(4)')).toThrow(/Unknown function/);
  });

  it('checks arity at parse time', () => {
    expect(() => Formula.parse('floor(1, 2)')).toThrow(/takes 1 argument/);
  });
});

describe('the ability modifier formula, which every 5e stat depends on', () => {
  const mod = Formula.parse('floor((score - 10) / 2)');
  it.each([
    [1, -5],
    [8, -1],
    [9, -1],
    [10, 0],
    [11, 0],
    [15, 2],
    [20, 5],
    [30, 10],
  ])('score %i gives %i', (score, expected) => {
    expect(mod.evaluate(scope({ score }))).toBe(expected);
  });
});

describe('sandbox', () => {
  it.each(['constructor', '__proto__', 'globalThis', 'process.env.SECRET', 'this.constructor'])(
    'treats `%s` as an ordinary reference with no host access',
    (source) => {
      // These parse as plain reference paths. They resolve to nothing because the
      // scope has no such key â€” there is no path from a formula to the host.
      const formula = Formula.parse(source);
      expect(formula.evaluate(scope({}), { onMissingReference: () => 0 })).toBe(0);
    },
  );

  it.each(['1; 2', 'a = 1', '1 & 2', '1 | 2', 'x => x', '`${x}`'])('rejects `%s`', (source) => {
    expect(() => Formula.parse(source)).toThrow(FormulaSyntaxError);
  });

  it('rejects a formula longer than the limit', () => {
    expect(() => Formula.parse('1+'.repeat(600) + '1')).toThrow(/exceeds 1000 characters/);
  });

  it('rejects nesting deeper than the limit rather than overflowing the stack', () => {
    expect(() => Formula.parse('('.repeat(100) + '1' + ')'.repeat(100))).toThrow(/nests deeper/);
  });

  it('rejects division by zero rather than yielding Infinity', () => {
    expect(() => evaluate('1 / 0')).toThrow(/Division by zero/);
  });
});

describe('error messages', () => {
  it('points at the offending position', () => {
    const error = Formula.tryParse('1 + + 2');
    expect(error.ok).toBe(false);
    if (!error.ok) expect(error.error.message).toMatch(/position 4/);
  });

  it('suggests == when = is used', () => {
    expect(() => Formula.parse('a = 1')).toThrow(/Use '=='/);
  });

  it('suggests and/or for & and |', () => {
    expect(() => Formula.parse('a & b')).toThrow(/Use 'and' \/ 'or'/);
  });

  it('tryParse returns the error instead of throwing', () => {
    const result = Formula.tryParse('floor(');
    expect(result.ok).toBe(false);
  });
});
