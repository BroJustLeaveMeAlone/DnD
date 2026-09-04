import type { Effect } from './effect.js';
import { Formula } from './formula/index.js';
import type { GrantSpec } from './module.js';
import type { Predicate } from './predicate.js';

/**
 * JSON round-tripping for effects, predicates, and grants.
 *
 * Content lives in Postgres as JSONB, but effects hold parsed `Formula` objects
 * and predicates nest them. Formulas serialise as their source text and reparse
 * on load, so the stored form stays human-readable and diffable — which matters
 * when a homebrew author wants to see what changed between two versions.
 */

export type JsonEffect = Record<string, unknown>;
export type JsonPredicate = Record<string, unknown>;
export type JsonGrant = Record<string, unknown>;

export function serializePredicate(predicate: Predicate): JsonPredicate {
  switch (predicate.kind) {
    case 'expression':
      return { kind: 'expression', formula: predicate.formula.source };
    case 'all':
    case 'any':
      return { kind: predicate.kind, of: predicate.of.map(serializePredicate) };
    case 'not':
      return { kind: 'not', of: serializePredicate(predicate.of) };
    default:
      return { ...predicate };
  }
}

export function deserializePredicate(json: JsonPredicate): Predicate {
  const kind = json.kind as Predicate['kind'];
  switch (kind) {
    case 'expression':
      return { kind: 'expression', formula: Formula.parse(String(json.formula)) };
    case 'all':
    case 'any':
      return { kind, of: (json.of as JsonPredicate[]).map(deserializePredicate) };
    case 'not':
      return { kind: 'not', of: deserializePredicate(json.of as JsonPredicate) };
    case 'flag':
      return { kind: 'flag', flag: String(json.flag) };
    case 'always':
    case 'never':
      return { kind };
    default:
      throw new Error(`Unknown predicate kind \`${String(json.kind)}\``);
  }
}

export function serializeEffect(effect: Effect): JsonEffect {
  if (effect.kind === 'numeric') return { ...effect, value: effect.value.source };
  if (effect.kind === 'resource') return { ...effect, max: effect.max.source };
  return { ...effect };
}

export function deserializeEffect(json: JsonEffect): Effect {
  const kind = json.kind as Effect['kind'];
  if (kind === 'numeric') {
    return {
      kind,
      target: String(json.target),
      operation: json.operation as 'add' | 'set' | 'floor' | 'cap',
      value: Formula.parse(String(json.value)),
      ...(json.bonusType !== undefined ? { bonusType: String(json.bonusType) } : {}),
    };
  }
  if (kind === 'resource') {
    return {
      kind,
      target: String(json.target),
      max: Formula.parse(String(json.max)),
      recharge: json.recharge as
        'short-rest' | 'long-rest' | 'dawn' | 'encounter' | 'turn' | 'never',
      ...(json.tier !== undefined ? { tier: Number(json.tier) } : {}),
    };
  }
  return json as unknown as Effect;
}

export function serializeGrant(grant: GrantSpec): JsonGrant {
  return {
    effects: grant.effects.map(serializeEffect),
    ...(grant.atLevel !== undefined ? { atLevel: grant.atLevel } : {}),
    ...(grant.when !== undefined ? { when: serializePredicate(grant.when) } : {}),
    ...(grant.detail !== undefined ? { detail: grant.detail } : {}),
  };
}

export function deserializeGrant(json: JsonGrant): GrantSpec {
  return {
    effects: (json.effects as JsonEffect[]).map(deserializeEffect),
    ...(json.atLevel !== undefined ? { atLevel: Number(json.atLevel) } : {}),
    ...(json.when !== undefined ? { when: deserializePredicate(json.when as JsonPredicate) } : {}),
    ...(json.detail !== undefined ? { detail: String(json.detail) } : {}),
  };
}
