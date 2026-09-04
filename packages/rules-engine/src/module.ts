import { type BoundEffect, type Effect, bind } from './effect.js';
import { Formula, type FormulaValue } from './formula/index.js';
import { type Predicate, always } from './predicate.js';
import type { ResolutionInput } from './resolve.js';

/**
 * What a *system module* is, generically.
 *
 * A module is data: attributes, derived stats, and content entities that grant
 * effects. `dnd5e-2014` and `dnd5e-2024` are instances of this type, and so is
 * anything a user builds in the System Designer. Nothing here names a 5e
 * concept — see PLAN.md, "The Central Architectural Bet".
 */

export interface AttributeDefinition {
  /** Stable key used in formula paths: `attr.<key>.score`, `attr.<key>.mod`. */
  key: string;
  name: string;
  abbreviation: string;
  /**
   * Derives the modifier, as a formula over this attribute's own resolved
   * score — so it must reference `attr.<key>.score` in full rather than a bare
   * `score`. Being explicit avoids rewriting formula source at compile time,
   * which is the sort of string surgery that breaks quietly.
   *
   * Omit for systems where the score *is* the modifier.
   */
  modifier?: string;
  default?: number;
}

export interface DerivedStatDefinition {
  key: string;
  name: string;
  /** Starting value before any effect applies. */
  base?: number;
  /** Computed instead of a flat base. Emitted as a `set` from the module. */
  formula?: string;
}

/** A bundle of effects an entity confers, optionally gated. */
export interface GrantSpec {
  effects: Effect[];
  /** Applies only from this level of the granting class onward. */
  atLevel?: number;
  when?: Predicate;
  /** Qualifier shown in the provenance trace, e.g. "wearing armor". */
  detail?: string;
}

export interface ModuleEntity {
  key: string;
  type: string;
  name: string;
  grants?: GrantSpec[];
  /** Free-form payload the sheet renders: spell level, damage dice, weight. */
  data?: Readonly<Record<string, unknown>>;
}

export interface SystemModule {
  id: string;
  name: string;
  /** Attribution notice. SRD content is CC-BY-4.0 and must credit its source. */
  source: { id: string; name: string; license: string | null };
  attributes: AttributeDefinition[];
  derived: DerivedStatDefinition[];
  entities: ModuleEntity[];
}

/** What the player chose. Decisions, never computed results — see PLAN.md §1. */
export interface CharacterBuild {
  /** Raw attribute scores keyed by attribute key. */
  attributes: Readonly<Record<string, number>>;
  /** Entity keys taken at creation: species, background, feats. */
  taken?: readonly string[];
  classes?: readonly { key: string; subclass?: string; level: number }[];
  /** Entity keys carried, and whether they are currently in effect. */
  inventory?: readonly { key: string; equipped?: boolean; attuned?: boolean }[];
  /** Transient states: raging, concentrating, prone. */
  flags?: readonly string[];
}

export class ModuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModuleError';
  }
}

const entityIndex = (module: SystemModule): ReadonlyMap<string, ModuleEntity> =>
  new Map(module.entities.map((entity) => [entity.key, entity]));

/**
 * Turns a module plus a build into engine input.
 *
 * Item grants are gated on being equipped or attuned rather than filtered out
 * here, so a sheathed sword still appears in the provenance trace with its
 * condition unmet — "why is my +1 not applying" stays answerable.
 */
export function compile(module: SystemModule, build: CharacterBuild): ResolutionInput {
  const entities = entityIndex(module);
  const facts: Record<string, FormulaValue> = {};
  const bases: Record<string, number> = {};
  const effects: BoundEffect[] = [];
  const flags = new Set<string>(build.flags ?? []);

  // --- attributes -----------------------------------------------------------
  //
  // Scores are BASES, not facts, and modifiers are derived from them.
  //
  // Making the score a fact would freeze it at the value the player picked, so
  // every `add('attr.str.score', 1)` from a species or background would land on
  // a stat nobody reads while the modifier kept using the raw number. That bug
  // is silent — the sheet looks plausible and every derived value is wrong.
  for (const attribute of module.attributes) {
    bases[`attr.${attribute.key}.score`] =
      build.attributes[attribute.key] ?? attribute.default ?? 0;

    effects.push(
      bind(
        {
          kind: 'numeric',
          target: `attr.${attribute.key}.mod`,
          operation: 'set',
          value: Formula.parse(attribute.modifier ?? `attr.${attribute.key}.score`),
        },
        { id: `${module.id}:attr.${attribute.key}.mod`, name: attribute.name },
      ),
    );
  }

  // --- levels ---------------------------------------------------------------
  let totalLevel = 0;
  for (const entry of build.classes ?? []) {
    totalLevel += entry.level;
    facts[`level.${entry.key}`] = entry.level;
  }
  facts.level = totalLevel;

  // --- derived stat definitions --------------------------------------------
  for (const derived of module.derived) {
    if (derived.base !== undefined) bases[derived.key] = derived.base;
    if (derived.formula) {
      effects.push(
        bind(
          {
            kind: 'numeric',
            target: derived.key,
            operation: 'set',
            value: Formula.parse(derived.formula),
          },
          { id: `${module.id}:${derived.key}`, name: derived.name },
        ),
      );
    }
  }

  const emit = (entity: ModuleEntity, grantedLevel: number | undefined, gate: Predicate) => {
    for (const grant of entity.grants ?? []) {
      if (grant.atLevel !== undefined && (grantedLevel ?? 0) < grant.atLevel) continue;

      const when: Predicate =
        gate.kind === 'always'
          ? (grant.when ?? always)
          : grant.when
            ? { kind: 'all', of: [gate, grant.when] }
            : gate;

      for (const effect of grant.effects) {
        effects.push(
          bind(
            effect,
            {
              id: entity.key,
              name: entity.name,
              ...(grant.detail !== undefined ? { detail: grant.detail } : {}),
            },
            when,
          ),
        );
      }
    }
  };

  const require = (key: string): ModuleEntity => {
    const entity = entities.get(key);
    if (!entity) throw new ModuleError(`\`${key}\` is not defined in system \`${module.id}\``);
    return entity;
  };

  // --- species, background, feats, chosen options ---------------------------
  for (const key of build.taken ?? []) emit(require(key), totalLevel, always);

  // --- classes and subclasses ----------------------------------------------
  for (const entry of build.classes ?? []) {
    emit(require(entry.key), entry.level, always);
    if (entry.subclass) emit(require(entry.subclass), entry.level, always);
  }

  // --- inventory ------------------------------------------------------------
  for (const item of build.inventory ?? []) {
    const entity = require(item.key);
    if (item.equipped) flags.add(`equipped.${item.key}`);
    if (item.attuned) flags.add(`attuned.${item.key}`);

    const conditions: Predicate[] = [];
    if (item.equipped !== undefined)
      conditions.push({ kind: 'flag', flag: `equipped.${item.key}` });
    if (item.attuned !== undefined) conditions.push({ kind: 'flag', flag: `attuned.${item.key}` });

    const gate: Predicate =
      conditions.length === 0
        ? always
        : conditions.length === 1
          ? conditions[0]!
          : { kind: 'all', of: conditions };

    emit(entity, totalLevel, gate);
  }

  return { facts, bases, flags: [...flags], effects };
}
