export type BinaryOperator =
  '+' | '-' | '*' | '/' | '%' | '<' | '<=' | '>' | '>=' | '==' | '!=' | 'and' | 'or';

export type UnaryOperator = '-' | 'not';

export type Node =
  | { kind: 'number'; value: number }
  | { kind: 'boolean'; value: boolean }
  /** A dotted path into the resolution context, e.g. `attr.dex.mod`. */
  | { kind: 'reference'; path: string }
  | { kind: 'unary'; operator: UnaryOperator; operand: Node }
  | { kind: 'binary'; operator: BinaryOperator; left: Node; right: Node }
  | { kind: 'call'; callee: string; args: Node[] };

/**
 * Every reference a formula depends on. Used by the resolver for cycle
 * detection, and by the Phase 7 linter to flag formulas pointing at attributes
 * that no longer exist.
 */
export function referencesOf(node: Node, into: Set<string> = new Set()): Set<string> {
  switch (node.kind) {
    case 'reference':
      into.add(node.path);
      break;
    case 'unary':
      referencesOf(node.operand, into);
      break;
    case 'binary':
      referencesOf(node.left, into);
      referencesOf(node.right, into);
      break;
    case 'call':
      for (const arg of node.args) referencesOf(arg, into);
      break;
    case 'number':
    case 'boolean':
      break;
  }
  return into;
}
