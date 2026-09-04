/**
 * Tokenizer for the formula DSL.
 *
 * The DSL exists because content is untrusted user input and must never reach
 * `eval` or `new Function`. It is deliberately small: arithmetic, comparison,
 * boolean logic, a fixed function set, and dotted references into the character
 * context. There are no loops, no assignment, no user-defined functions, and no
 * way to reach the host environment, so evaluation always terminates.
 */

export type TokenKind = 'number' | 'ident' | 'operator' | 'lparen' | 'rparen' | 'comma' | 'eof';

export interface Token {
  kind: TokenKind;
  /** Raw text, or the numeric value for `number`. */
  text: string;
  value?: number;
  /** Byte offset in the source, for error messages. */
  pos: number;
}

export class FormulaSyntaxError extends Error {
  constructor(
    message: string,
    readonly source: string,
    readonly pos: number,
  ) {
    super(`${message} (at position ${pos} in \`${source}\`)`);
    this.name = 'FormulaSyntaxError';
  }
}

/** Guards against pathological input from the content editor. */
export const MAX_FORMULA_LENGTH = 1000;

const OPERATORS = ['<=', '>=', '==', '!=', '+', '-', '*', '/', '%', '<', '>'] as const;

const isDigit = (c: string) => c >= '0' && c <= '9';
const isIdentStart = (c: string) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_';

/**
 * Hyphens are deliberately NOT identifier characters. Allowing them would make
 * `level-1` ambiguous between subtraction and a reference named `level-1`, and
 * the reference reading wins silently — a user typing `level-1` in the formula
 * editor would get an unknown-reference instead of arithmetic.
 *
 * Content keys are kebab-case slugs, so formula paths use underscores:
 * `skill.sleight_of_hand`, not `skill.sleight-of-hand`.
 */
const isIdentPart = (c: string) => isIdentStart(c) || isDigit(c);

export function tokenize(source: string): Token[] {
  if (source.length > MAX_FORMULA_LENGTH) {
    throw new FormulaSyntaxError(
      `Formula exceeds ${MAX_FORMULA_LENGTH} characters`,
      source,
      MAX_FORMULA_LENGTH,
    );
  }

  const tokens: Token[] = [];
  let i = 0;

  while (i < source.length) {
    const char = source[i]!;

    if (char === ' ' || char === '\t' || char === '\n' || char === '\r') {
      i += 1;
      continue;
    }

    if (char === '(') {
      tokens.push({ kind: 'lparen', text: '(', pos: i });
      i += 1;
      continue;
    }

    if (char === ')') {
      tokens.push({ kind: 'rparen', text: ')', pos: i });
      i += 1;
      continue;
    }

    if (char === ',') {
      tokens.push({ kind: 'comma', text: ',', pos: i });
      i += 1;
      continue;
    }

    if (isDigit(char) || (char === '.' && isDigit(source[i + 1] ?? ''))) {
      const start = i;
      while (i < source.length && isDigit(source[i]!)) i += 1;
      if (source[i] === '.') {
        i += 1;
        while (i < source.length && isDigit(source[i]!)) i += 1;
      }
      const text = source.slice(start, i);
      const value = Number(text);
      if (!Number.isFinite(value)) {
        throw new FormulaSyntaxError(`Invalid number \`${text}\``, source, start);
      }
      tokens.push({ kind: 'number', text, value, pos: start });
      continue;
    }

    if (isIdentStart(char)) {
      const start = i;
      // A reference is a dotted path: `attr.dex.mod`, `level.fighter`.
      // Segments may contain hyphens so slugs work as path keys.
      for (;;) {
        while (i < source.length && isIdentPart(source[i]!)) i += 1;
        if (source[i] === '.' && isIdentStart(source[i + 1] ?? '')) {
          i += 1;
          continue;
        }
        break;
      }
      tokens.push({ kind: 'ident', text: source.slice(start, i), pos: start });
      continue;
    }

    const operator = OPERATORS.find((op) => source.startsWith(op, i));
    if (operator) {
      tokens.push({ kind: 'operator', text: operator, pos: i });
      i += operator.length;
      continue;
    }

    if (char === '=') {
      throw new FormulaSyntaxError("Use '==' for comparison, not '='", source, i);
    }
    if (char === '&' || char === '|') {
      throw new FormulaSyntaxError(`Use 'and' / 'or' rather than \`${char}\``, source, i);
    }

    throw new FormulaSyntaxError(`Unexpected character \`${char}\``, source, i);
  }

  tokens.push({ kind: 'eof', text: '', pos: source.length });
  return tokens;
}
