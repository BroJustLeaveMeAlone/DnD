import type { Node } from './ast.js';

export type FormulaValue = number | boolean;

export class FormulaEvaluationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FormulaEvaluationError';
  }
}

/**
 * How a formula reaches the outside world. The single narrow seam through which
 * a formula can observe anything — there is no other channel, which is what
 * makes evaluation sandboxed and reproducible.
 *
 * An unresolvable reference returns `undefined` rather than throwing, so the
 * caller decides whether that is a hard error (the linter) or a zero (a
 * modifier referring to a resource this character does not have).
 */
export interface FormulaScope {
  lookup(path: string): FormulaValue | undefined;
}

export interface EvaluateOptions {
  /**
   * Value substituted for a reference the scope cannot resolve.
   * Defaults to `undefined`, which raises an error.
   */
  onMissingReference?: (path: string) => FormulaValue | undefined;
}

const asNumber = (value: FormulaValue, context: string): number => {
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (!Number.isFinite(value)) {
    throw new FormulaEvaluationError(`${context} produced a non-finite number`);
  }
  return value;
};

const asBoolean = (value: FormulaValue): boolean =>
  typeof value === 'boolean' ? value : value !== 0;

export function evaluateNode(
  node: Node,
  scope: FormulaScope,
  options: EvaluateOptions = {},
): FormulaValue {
  switch (node.kind) {
    case 'number':
      return node.value;

    case 'boolean':
      return node.value;

    case 'reference': {
      const raw = scope.lookup(node.path);

      // Trust nothing a scope hands back. A scope backed by a plain object
      // resolves `constructor` and `__proto__` off the prototype chain, which
      // would hand a formula a live reference to a host function. Accepting
      // only primitives closes that off no matter how a caller implements
      // `lookup`, rather than relying on every caller to get it right.
      const value = typeof raw === 'number' || typeof raw === 'boolean' ? raw : undefined;

      if (value !== undefined) {
        if (typeof value === 'number' && !Number.isFinite(value)) {
          throw new FormulaEvaluationError(`Reference \`${node.path}\` is not a finite number`);
        }
        return value;
      }

      const fallback = options.onMissingReference?.(node.path);
      if (fallback !== undefined) return fallback;

      throw new FormulaEvaluationError(`Unknown reference \`${node.path}\``);
    }

    case 'unary': {
      const operand = evaluateNode(node.operand, scope, options);
      if (node.operator === 'not') return !asBoolean(operand);
      return -asNumber(operand, 'Negation');
    }

    case 'binary':
      return evaluateBinary(node, scope, options);

    case 'call':
      return evaluateCall(node, scope, options);
  }
}

function evaluateBinary(
  node: Extract<Node, { kind: 'binary' }>,
  scope: FormulaScope,
  options: EvaluateOptions,
): FormulaValue {
  // Short-circuit so `cond and expensive` does not evaluate the right side, and
  // so `has.shield and shield.bonus` stays safe when the left side is false.
  if (node.operator === 'and') {
    return asBoolean(evaluateNode(node.left, scope, options))
      ? asBoolean(evaluateNode(node.right, scope, options))
      : false;
  }
  if (node.operator === 'or') {
    return asBoolean(evaluateNode(node.left, scope, options))
      ? true
      : asBoolean(evaluateNode(node.right, scope, options));
  }

  const left = evaluateNode(node.left, scope, options);
  const right = evaluateNode(node.right, scope, options);

  switch (node.operator) {
    case '==':
      return left === right;
    case '!=':
      return left !== right;
    default:
      break;
  }

  const a = asNumber(left, `Left operand of '${node.operator}'`);
  const b = asNumber(right, `Right operand of '${node.operator}'`);

  switch (node.operator) {
    case '+':
      return a + b;
    case '-':
      return a - b;
    case '*':
      return a * b;
    case '/':
      if (b === 0) throw new FormulaEvaluationError('Division by zero');
      return a / b;
    case '%':
      if (b === 0) throw new FormulaEvaluationError('Modulo by zero');
      return a % b;
    case '<':
      return a < b;
    case '<=':
      return a <= b;
    case '>':
      return a > b;
    case '>=':
      return a >= b;
  }
}

function evaluateCall(
  node: Extract<Node, { kind: 'call' }>,
  scope: FormulaScope,
  options: EvaluateOptions,
): FormulaValue {
  // `if` is lazy in its branches; everything else is strict.
  if (node.callee === 'if') {
    const [condition, whenTrue, whenFalse] = node.args as [Node, Node, Node];
    return asBoolean(evaluateNode(condition, scope, options))
      ? evaluateNode(whenTrue, scope, options)
      : evaluateNode(whenFalse, scope, options);
  }

  const args = node.args.map((arg, i) =>
    asNumber(evaluateNode(arg, scope, options), `Argument ${i + 1} of \`${node.callee}\``),
  );

  switch (node.callee) {
    case 'floor':
      return Math.floor(args[0]!);
    case 'ceil':
      return Math.ceil(args[0]!);
    case 'round':
      // Math.round is asymmetric for negatives (-0.5 rounds to -0). Round half
      // away from zero so `round(-2.5)` is -3, which is what a rules author means.
      return Math.sign(args[0]!) * Math.round(Math.abs(args[0]!));
    case 'abs':
      return Math.abs(args[0]!);
    case 'sign':
      return Math.sign(args[0]!);
    case 'min':
      return Math.min(...args);
    case 'max':
      return Math.max(...args);
    default:
      throw new FormulaEvaluationError(`Unknown function \`${node.callee}\``);
  }
}
