import { describe, expect, it } from 'vitest';
import { characterBuild, totalLevel } from './character.js';

const valid = {
  attributes: { str: 16, dex: 14, con: 15, int: 10, wis: 12, cha: 8 },
  taken: ['human', 'soldier'],
  classes: [{ key: 'fighter', subclass: 'fighter-champion', level: 5 }],
  inventory: [{ key: 'chain-mail', equipped: true }],
};

describe('characterBuild', () => {
  it('accepts a well-formed build and fills defaults', () => {
    const parsed = characterBuild.parse({ attributes: { str: 10 } });
    expect(parsed.taken).toEqual([]);
    expect(parsed.classes).toEqual([]);
    expect(parsed.inventory).toEqual([]);
    expect(parsed.flags).toEqual([]);
  });

  it('round-trips a realistic build unchanged', () => {
    const parsed = characterBuild.parse(valid);
    expect(parsed.classes[0]?.subclass).toBe('fighter-champion');
    expect(parsed.inventory[0]?.equipped).toBe(true);
  });

  it.each([
    ['a score above 30', { attributes: { str: 99 } }],
    ['a score below 1', { attributes: { str: 0 } }],
    ['a fractional score', { attributes: { str: 12.5 } }],
    ['level 0', { attributes: {}, classes: [{ key: 'fighter', level: 0 }] }],
    ['level 21', { attributes: {}, classes: [{ key: 'fighter', level: 21 }] }],
    ['a non-slug entity key', { attributes: {}, taken: ['Not A Slug'] }],
    ['a non-slug class key', { attributes: {}, classes: [{ key: 'Fighter', level: 1 }] }],
    ['missing attributes entirely', {}],
  ])('rejects %s', (_case, input) => {
    expect(characterBuild.safeParse(input).success).toBe(false);
  });

  it('rejects the shapes an attacker would try through the form field', () => {
    // updateBuildAction takes build JSON from a hidden input, so these are the
    // realistic malicious payloads rather than hypothetical ones.
    expect(characterBuild.safeParse('not an object').success).toBe(false);
    expect(characterBuild.safeParse(null).success).toBe(false);
    expect(characterBuild.safeParse([]).success).toBe(false);
    expect(
      characterBuild.safeParse({ attributes: { str: 10 }, classes: 'not an array' }).success,
    ).toBe(false);
  });

  it('strips unknown keys rather than storing them', () => {
    const parsed = characterBuild.parse({ ...valid, injected: { evil: true } });
    expect(parsed).not.toHaveProperty('injected');
  });

  it('sums multiclass levels', () => {
    const parsed = characterBuild.parse({
      attributes: { str: 10 },
      classes: [
        { key: 'fighter', level: 5 },
        { key: 'wizard', level: 3 },
      ],
    });
    expect(totalLevel(parsed)).toBe(8);
  });
});
