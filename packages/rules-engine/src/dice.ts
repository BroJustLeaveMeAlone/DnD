/**
 * Dice notation: parsing, and rolling.
 *
 * Randomness is injected, never sourced here. That keeps the package
 * deterministic (see index.ts), makes every roll reproducible from a seed, and
 * means a server and a client replaying the same roll agree — which the shared
 * campaign roll feed depends on.
 *
 * Grammar:
 *   expression := term (('+' | '-') term)*
 *   term       := dice | integer
 *   dice       := [count] 'd' sides modifier*
 *   modifier   := 'kh'N | 'kl'N | 'dh'N | 'dl'N | 'r'N | 'ro'N | '!' | 'min'N | 'max'N
 */

export type RandomSource = () => number;

export class DiceSyntaxError extends Error {
  constructor(
    message: string,
    readonly source: string,
  ) {
    super(`${message} (in \`${source}\`)`);
    this.name = 'DiceSyntaxError';
  }
}

/** Guards against `999999d20` exhausting memory. */
export const MAX_DICE = 1000;
export const MAX_SIDES = 1000;

export interface DiceTerm {
  kind: 'dice';
  count: number;
  sides: number;
  /** Keep the highest / lowest N. */
  keepHighest?: number;
  keepLowest?: number;
  /** Drop the highest / lowest N. */
  dropHighest?: number;
  dropLowest?: number;
  /** Reroll results at or below N. `once` stops after a single reroll. */
  reroll?: { threshold: number; once: boolean };
  /** Roll again on a maximum result, adding the new die. */
  explode?: boolean;
  /** Clamp each die. */
  minimum?: number;
  maximum?: number;
  sign: 1 | -1;
}

export interface ConstantTerm {
  kind: 'constant';
  value: number;
  sign: 1 | -1;
}

export type Term = DiceTerm | ConstantTerm;

export interface DieResult {
  /** Final value counted toward the total. */
  value: number;
  /** Every face rolled for this die, including rerolls and explosions. */
  rolls: number[];
  kept: boolean;
  /** Why it was not kept, when it was not. */
  reason?: 'kept-highest' | 'kept-lowest' | 'dropped';
}

export interface TermResult {
  term: Term;
  dice: DieResult[];
  subtotal: number;
}

export interface RollResult {
  expression: string;
  total: number;
  terms: TermResult[];
  /** Compact rendering: `2d6+3: [4, 5] + 3 = 12`. */
  breakdown: string;
}

// --- parsing ----------------------------------------------------------------

const INTEGER = /^\d+/;

class Parser {
  private index = 0;

  constructor(private readonly source: string) {}

  private get rest(): string {
    return this.source.slice(this.index);
  }

  private fail(message: string): never {
    throw new DiceSyntaxError(`${message} at position ${this.index}`, this.source);
  }

  private skipSpace(): void {
    while (this.source[this.index] === ' ') this.index += 1;
  }

  private takeInteger(): number | undefined {
    const match = INTEGER.exec(this.rest);
    if (!match) return undefined;
    this.index += match[0].length;
    return Number(match[0]);
  }

  private takeWord(word: string): boolean {
    if (this.rest.toLowerCase().startsWith(word)) {
      this.index += word.length;
      return true;
    }
    return false;
  }

  parse(): Term[] {
    const terms: Term[] = [];
    let sign: 1 | -1 = 1;

    this.skipSpace();
    if (this.source.trim() === '') this.fail('Empty expression');

    for (;;) {
      this.skipSpace();
      terms.push(this.parseTerm(sign));
      this.skipSpace();

      const next = this.source[this.index];
      if (next === '+') {
        sign = 1;
        this.index += 1;
      } else if (next === '-') {
        sign = -1;
        this.index += 1;
      } else if (next === undefined) {
        break;
      } else {
        this.fail(`Unexpected \`${next}\``);
      }
    }

    return terms;
  }

  private parseTerm(sign: 1 | -1): Term {
    const count = this.takeInteger();

    if (this.source[this.index]?.toLowerCase() !== 'd') {
      if (count === undefined) this.fail('Expected a number or dice');
      return { kind: 'constant', value: count, sign };
    }
    this.index += 1;

    const sides = this.takeInteger();
    if (sides === undefined) this.fail('Expected the number of sides after `d`');
    if (sides < 1) this.fail('Dice need at least one side');
    if (sides > MAX_SIDES) this.fail(`Dice may not have more than ${MAX_SIDES} sides`);

    const total = count ?? 1;
    if (total < 1) this.fail('Dice count must be at least 1');
    if (total > MAX_DICE) this.fail(`Cannot roll more than ${MAX_DICE} dice at once`);

    const term: DiceTerm = { kind: 'dice', count: total, sides, sign };

    for (;;) {
      if (this.takeWord('kh')) term.keepHighest = this.takeInteger() ?? 1;
      else if (this.takeWord('kl')) term.keepLowest = this.takeInteger() ?? 1;
      else if (this.takeWord('dh')) term.dropHighest = this.takeInteger() ?? 1;
      else if (this.takeWord('dl')) term.dropLowest = this.takeInteger() ?? 1;
      else if (this.takeWord('ro'))
        term.reroll = { threshold: this.takeInteger() ?? 1, once: true };
      else if (this.takeWord('r'))
        term.reroll = { threshold: this.takeInteger() ?? 1, once: false };
      else if (this.takeWord('min')) term.minimum = this.takeInteger() ?? 1;
      else if (this.takeWord('max')) term.maximum = this.takeInteger() ?? sides;
      else if (this.takeWord('!')) term.explode = true;
      else break;
    }

    const keeps = [term.keepHighest, term.keepLowest, term.dropHighest, term.dropLowest].filter(
      (v) => v !== undefined,
    );
    if (keeps.length > 1) this.fail('Use only one of kh, kl, dh, dl');
    if (keeps[0] !== undefined && keeps[0] > total) {
      this.fail(`Cannot keep or drop ${keeps[0]} of ${total} dice`);
    }

    return term;
  }
}

export function parseDice(source: string): Term[] {
  return new Parser(source).parse();
}

export function tryParseDice(
  source: string,
): { ok: true; terms: Term[] } | { ok: false; error: Error } {
  try {
    return { ok: true, terms: parseDice(source) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error : new Error(String(error)) };
  }
}

// --- rolling ----------------------------------------------------------------

/** Bounds runaway explosions on a d1, where every roll is a maximum. */
const MAX_EXPLOSIONS = 100;

function rollOne(term: DiceTerm, random: RandomSource): DieResult {
  const face = () => Math.floor(random() * term.sides) + 1;
  const rolls: number[] = [];

  let value = face();
  rolls.push(value);

  if (term.reroll) {
    let rerolls = 0;
    while (value <= term.reroll.threshold && rerolls < MAX_EXPLOSIONS) {
      value = face();
      rolls.push(value);
      rerolls += 1;
      if (term.reroll.once) break;
    }
  }

  if (term.explode) {
    let explosions = 0;
    let latest = value;
    while (latest === term.sides && explosions < MAX_EXPLOSIONS) {
      latest = face();
      rolls.push(latest);
      value += latest;
      explosions += 1;
    }
  }

  if (term.minimum !== undefined) value = Math.max(value, term.minimum);
  if (term.maximum !== undefined) value = Math.min(value, term.maximum);

  return { value, rolls, kept: true };
}

function applyKeep(dice: DieResult[], term: DiceTerm): void {
  const keep = term.keepHighest ?? term.keepLowest;
  const drop = term.dropHighest ?? term.dropLowest;
  if (keep === undefined && drop === undefined) return;

  // Sort indices rather than the array, so the reported order stays the order
  // the dice were rolled in — a player watching results appear expects that.
  const order = dice
    .map((die, index) => ({ index, value: die.value }))
    .sort((a, b) => b.value - a.value);

  const discarded = new Set<number>();

  if (term.keepHighest !== undefined) {
    for (const { index } of order.slice(term.keepHighest)) discarded.add(index);
  } else if (term.keepLowest !== undefined) {
    for (const { index } of order.slice(0, dice.length - term.keepLowest)) discarded.add(index);
  } else if (term.dropHighest !== undefined) {
    for (const { index } of order.slice(0, term.dropHighest)) discarded.add(index);
  } else if (term.dropLowest !== undefined) {
    for (const { index } of order.slice(dice.length - term.dropLowest)) discarded.add(index);
  }

  for (const index of discarded) {
    const die = dice[index]!;
    die.kept = false;
    die.reason =
      term.keepHighest !== undefined
        ? 'kept-highest'
        : term.keepLowest !== undefined
          ? 'kept-lowest'
          : 'dropped';
  }
}

export interface RollOptions {
  random?: RandomSource;
}

export function roll(expression: string, options: RollOptions = {}): RollResult {
  const random = options.random ?? Math.random;
  const terms = parseDice(expression);
  const results: TermResult[] = [];
  let total = 0;

  for (const term of terms) {
    if (term.kind === 'constant') {
      const subtotal = term.value * term.sign;
      results.push({ term, dice: [], subtotal });
      total += subtotal;
      continue;
    }

    const dice = Array.from({ length: term.count }, () => rollOne(term, random));
    applyKeep(dice, term);

    const subtotal = dice.reduce((sum, die) => sum + (die.kept ? die.value : 0), 0) * term.sign;
    results.push({ term, dice, subtotal });
    total += subtotal;
  }

  return { expression, total, terms: results, breakdown: describe(expression, results, total) };
}

function describe(expression: string, terms: TermResult[], total: number): string {
  const parts = terms.map((result, index) => {
    const sign = result.term.sign === -1 ? '-' : index === 0 ? '' : '+';
    const body =
      result.term.kind === 'constant'
        ? String(result.term.value)
        : `[${result.dice.map((d) => (d.kept ? d.value : `~~${d.value}~~`)).join(', ')}]`;
    return index === 0 ? `${sign}${body}` : ` ${sign} ${body}`;
  });

  return `${expression}: ${parts.join('')} = ${total}`;
}

/**
 * A seeded generator, so a roll can be replayed exactly.
 *
 * mulberry32 — small, fast, and good enough for dice. Not cryptographic; a roll
 * feed that matters for money would need something else, but this is a game.
 */
export function seededRandom(seed: number): RandomSource {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Advantage and disadvantage, expressed in the notation itself. */
export const withAdvantage = (modifier = 0) =>
  `2d20kh1${modifier ? (modifier > 0 ? `+${modifier}` : `${modifier}`) : ''}`;

export const withDisadvantage = (modifier = 0) =>
  `2d20kl1${modifier ? (modifier > 0 ? `+${modifier}` : `${modifier}`) : ''}`;
