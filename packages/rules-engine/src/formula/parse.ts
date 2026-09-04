import type { BinaryOperator, Node } from './ast.js';
import { FormulaSyntaxError, type Token, tokenize } from './tokenize.js';

/**
 * Pratt parser. Precedence climbing keeps the grammar in one table rather than
 * a ladder of mutually recursive functions.
 */

/** Higher binds tighter. */
const BINARY_PRECEDENCE: Record<BinaryOperator, number> = {
  or: 1,
  and: 2,
  '==': 3,
  '!=': 3,
  '<': 4,
  '<=': 4,
  '>': 4,
  '>=': 4,
  '+': 5,
  '-': 5,
  '*': 6,
  '/': 6,
  '%': 6,
};

const UNARY_PRECEDENCE = 7;

/** The complete function set. Anything else is a syntax error, by design. */
export const FUNCTIONS: Record<string, { arity: number | 'variadic' }> = {
  floor: { arity: 1 },
  ceil: { arity: 1 },
  round: { arity: 1 },
  abs: { arity: 1 },
  sign: { arity: 1 },
  min: { arity: 'variadic' },
  max: { arity: 'variadic' },
  // `if(condition, then, else)` — the only branching construct.
  if: { arity: 3 },
};

const KEYWORDS = new Set(['and', 'or', 'not', 'true', 'false']);

/** Bounds recursion so deeply nested input cannot blow the stack. */
export const MAX_PARSE_DEPTH = 64;

class Parser {
  private index = 0;

  constructor(
    private readonly tokens: Token[],
    private readonly source: string,
  ) {}

  private peek(): Token {
    return this.tokens[this.index]!;
  }

  private next(): Token {
    return this.tokens[this.index++]!;
  }

  private expect(kind: Token['kind'], what: string): Token {
    const token = this.peek();
    if (token.kind !== kind) {
      throw new FormulaSyntaxError(
        `Expected ${what} but found ${token.kind === 'eof' ? 'end of formula' : `\`${token.text}\``}`,
        this.source,
        token.pos,
      );
    }
    return this.next();
  }

  parse(): Node {
    const node = this.parseExpression(0, 0);
    const token = this.peek();
    if (token.kind !== 'eof') {
      throw new FormulaSyntaxError(`Unexpected \`${token.text}\``, this.source, token.pos);
    }
    return node;
  }

  private parseExpression(minPrecedence: number, depth: number): Node {
    if (depth > MAX_PARSE_DEPTH) {
      throw new FormulaSyntaxError(
        `Formula nests deeper than ${MAX_PARSE_DEPTH} levels`,
        this.source,
        this.peek().pos,
      );
    }

    let left = this.parsePrefix(depth);

    for (;;) {
      const token = this.peek();
      const operator = this.asBinaryOperator(token);
      if (!operator) break;

      const precedence = BINARY_PRECEDENCE[operator];
      if (precedence < minPrecedence) break;

      this.next();
      // All binary operators are left-associative, hence precedence + 1.
      const right = this.parseExpression(precedence + 1, depth + 1);
      left = { kind: 'binary', operator, left, right };
    }

    return left;
  }

  private asBinaryOperator(token: Token): BinaryOperator | undefined {
    if (token.kind === 'operator' && token.text in BINARY_PRECEDENCE) {
      return token.text as BinaryOperator;
    }
    if (token.kind === 'ident' && (token.text === 'and' || token.text === 'or')) {
      return token.text;
    }
    return undefined;
  }

  private parsePrefix(depth: number): Node {
    const token = this.next();

    if (token.kind === 'number') {
      return { kind: 'number', value: token.value! };
    }

    if (token.kind === 'operator' && token.text === '-') {
      return {
        kind: 'unary',
        operator: '-',
        operand: this.parseExpression(UNARY_PRECEDENCE, depth + 1),
      };
    }

    if (token.kind === 'lparen') {
      const inner = this.parseExpression(0, depth + 1);
      this.expect('rparen', "')'");
      return inner;
    }

    if (token.kind === 'ident') {
      if (token.text === 'true') return { kind: 'boolean', value: true };
      if (token.text === 'false') return { kind: 'boolean', value: false };
      if (token.text === 'not') {
        return {
          kind: 'unary',
          operator: 'not',
          operand: this.parseExpression(UNARY_PRECEDENCE, depth + 1),
        };
      }

      if (this.peek().kind === 'lparen') {
        return this.parseCall(token, depth);
      }

      if (KEYWORDS.has(token.text)) {
        throw new FormulaSyntaxError(
          `\`${token.text}\` is a keyword and cannot be used as a reference`,
          this.source,
          token.pos,
        );
      }

      return { kind: 'reference', path: token.text };
    }

    throw new FormulaSyntaxError(
      `Expected a value but found ${token.kind === 'eof' ? 'end of formula' : `\`${token.text}\``}`,
      this.source,
      token.pos,
    );
  }

  private parseCall(name: Token, depth: number): Node {
    const signature = FUNCTIONS[name.text];
    if (!signature) {
      const known = Object.keys(FUNCTIONS).join(', ');
      throw new FormulaSyntaxError(
        `Unknown function \`${name.text}\`. Available: ${known}`,
        this.source,
        name.pos,
      );
    }

    this.expect('lparen', "'('");
    const args: Node[] = [];

    if (this.peek().kind !== 'rparen') {
      for (;;) {
        args.push(this.parseExpression(0, depth + 1));
        if (this.peek().kind !== 'comma') break;
        this.next();
      }
    }
    this.expect('rparen', "')'");

    if (signature.arity === 'variadic') {
      if (args.length === 0) {
        throw new FormulaSyntaxError(
          `\`${name.text}\` needs at least one argument`,
          this.source,
          name.pos,
        );
      }
    } else if (args.length !== signature.arity) {
      throw new FormulaSyntaxError(
        `\`${name.text}\` takes ${signature.arity} argument(s), got ${args.length}`,
        this.source,
        name.pos,
      );
    }

    return { kind: 'call', callee: name.text, args };
  }
}

export function parseFormula(source: string): Node {
  return new Parser(tokenize(source), source).parse();
}
