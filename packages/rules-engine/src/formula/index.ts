import { type Node, referencesOf } from './ast.js';
import {
  type EvaluateOptions,
  type FormulaScope,
  type FormulaValue,
  evaluateNode,
} from './evaluate.js';
import { parseFormula } from './parse.js';

export * from './ast.js';
export * from './evaluate.js';
export * from './parse.js';
export * from './tokenize.js';

/**
 * A parsed formula. Parse once, evaluate many times — resolution re-evaluates
 * the same expressions across every recompute, and re-parsing each time would
 * dominate the sheet's performance budget.
 */
export class Formula {
  private constructor(
    readonly source: string,
    readonly ast: Node,
    readonly references: ReadonlySet<string>,
  ) {}

  static parse(source: string): Formula {
    const ast = parseFormula(source);
    return new Formula(source, ast, referencesOf(ast));
  }

  /** Parses, returning the error instead of throwing. For editor validation. */
  static tryParse(source: string): { ok: true; formula: Formula } | { ok: false; error: Error } {
    try {
      return { ok: true, formula: Formula.parse(source) };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error : new Error(String(error)) };
    }
  }

  evaluate(scope: FormulaScope, options?: EvaluateOptions): FormulaValue {
    return evaluateNode(this.ast, scope, options);
  }

  evaluateNumber(scope: FormulaScope, options?: EvaluateOptions): number {
    const value = this.evaluate(scope, options);
    return typeof value === 'boolean' ? (value ? 1 : 0) : value;
  }

  evaluateBoolean(scope: FormulaScope, options?: EvaluateOptions): boolean {
    const value = this.evaluate(scope, options);
    return typeof value === 'boolean' ? value : value !== 0;
  }

  toString(): string {
    return this.source;
  }
}

/** A formula, or a plain number for the common case of a flat bonus. */
export type FormulaLike = Formula | number | string;

export function toFormula(value: FormulaLike): Formula {
  if (value instanceof Formula) return value;
  if (typeof value === 'number') return Formula.parse(String(value));
  return Formula.parse(value);
}
