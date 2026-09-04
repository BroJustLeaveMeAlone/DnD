import type { Effect } from './effect.js';
import { Formula } from './formula/index.js';
import type { CharacterBuild, GrantSpec, ModuleEntity, SystemModule } from './module.js';
import { compile } from './module.js';
import type { Predicate } from './predicate.js';
import { resolve } from './resolve.js';

/**
 * Static analysis for a system, and generated probe characters that exercise it.
 *
 * This is what makes creation freedom survivable (PLAN.md §3). The engine
 * already degrades rather than crashing when content is broken — a bad formula
 * is dropped and a diagnostic raised — but a diagnostic only appears once
 * somebody builds the character that trips it. The linter finds the same
 * problems at authoring time, before a player does.
 *
 * Entirely deterministic. No AI, no API key, works offline. AI drafts and
 * organises; this is the half that verifies.
 */

export type LintSeverity = 'error' | 'warning' | 'info';

export type LintCode =
  | 'unknown-reference'
  | 'unparseable-formula'
  | 'circular-dependency'
  | 'duplicate-key'
  | 'shadowed-attribute'
  | 'undeclared-target'
  | 'unreachable-grant'
  | 'inert-entity'
  | 'unused-attribute'
  | 'probe-failure';

export interface LintFinding {
  severity: LintSeverity;
  code: LintCode;
  message: string;
  /** Where the problem lives, for linking straight to the editor. */
  entityKey?: string;
  statKey?: string;
  attributeKey?: string;
}

export interface LintOptions {
  /** Highest level probe characters are generated at. */
  maxLevel?: number;
  /** A derived value beyond this magnitude is reported as suspicious. */
  absurdThreshold?: number;
}

const DEFAULTS = { maxLevel: 20, absurdThreshold: 10_000 } as const;

// --- helpers ----------------------------------------------------------------

function formulasOf(effect: Effect): string[] {
  if (effect.kind === 'numeric') return [effect.value.source];
  if (effect.kind === 'resource') return [effect.max.source];
  return [];
}

function predicateFormulas(predicate: Predicate | undefined): string[] {
  if (!predicate) return [];
  switch (predicate.kind) {
    case 'expression':
      return [predicate.formula.source];
    case 'all':
    case 'any':
      return predicate.of.flatMap(predicateFormulas);
    case 'not':
      return predicateFormulas(predicate.of);
    default:
      return [];
  }
}

function grantFormulas(grant: GrantSpec): string[] {
  return [...grant.effects.flatMap(formulasOf), ...predicateFormulas(grant.when)];
}

/** Every path the system can actually resolve. */
function knownPaths(module: SystemModule): Set<string> {
  const paths = new Set<string>(['level']);

  for (const attribute of module.attributes) {
    paths.add(`attr.${attribute.key}.score`);
    paths.add(`attr.${attribute.key}.mod`);
  }
  for (const stat of module.derived) paths.add(stat.key);

  // A numeric effect creates its target even when the system never declared it.
  for (const entity of module.entities) {
    for (const grant of entity.grants ?? []) {
      for (const effect of grant.effects) {
        if (effect.kind === 'numeric' || effect.kind === 'resource') paths.add(effect.target);
      }
    }
    if (entity.type === 'class') paths.add(`level.${entity.key}`);
  }

  return paths;
}

/** `prof.<anything>` always resolves — the scale covers unlisted targets. */
const isAlwaysResolvable = (path: string) => path.startsWith('prof.');

// --- rules ------------------------------------------------------------------

function checkDuplicates(module: SystemModule, findings: LintFinding[]): void {
  const seenAttributes = new Set<string>();
  for (const attribute of module.attributes) {
    if (seenAttributes.has(attribute.key)) {
      findings.push({
        severity: 'error',
        code: 'duplicate-key',
        message: `Two attributes share the key \`${attribute.key}\`. One silently shadows the other.`,
        attributeKey: attribute.key,
      });
    }
    seenAttributes.add(attribute.key);
  }

  const seenStats = new Set<string>();
  const attributePaths = new Set(
    module.attributes.flatMap((a) => [`attr.${a.key}.score`, `attr.${a.key}.mod`]),
  );

  for (const stat of module.derived) {
    if (seenStats.has(stat.key)) {
      findings.push({
        severity: 'error',
        code: 'duplicate-key',
        message: `Two derived stats share the key \`${stat.key}\`.`,
        statKey: stat.key,
      });
    }
    seenStats.add(stat.key);

    if (attributePaths.has(stat.key)) {
      findings.push({
        severity: 'error',
        code: 'shadowed-attribute',
        message: `Derived stat \`${stat.key}\` shadows an attribute path and will fight it.`,
        statKey: stat.key,
      });
    }
  }
}

function checkFormulas(module: SystemModule, findings: LintFinding[]): void {
  const known = knownPaths(module);

  const inspect = (source: string, where: Omit<LintFinding, 'severity' | 'code' | 'message'>) => {
    const parsed = Formula.tryParse(source);
    if (!parsed.ok) {
      findings.push({
        severity: 'error',
        code: 'unparseable-formula',
        message: `\`${source}\` does not parse: ${parsed.error.message}`,
        ...where,
      });
      return;
    }
    for (const reference of parsed.formula.references) {
      if (!known.has(reference) && !isAlwaysResolvable(reference)) {
        findings.push({
          severity: 'error',
          code: 'unknown-reference',
          message: `\`${source}\` references \`${reference}\`, which nothing in this system provides.`,
          ...where,
        });
      }
    }
  };

  for (const attribute of module.attributes) {
    if (attribute.modifier) inspect(attribute.modifier, { attributeKey: attribute.key });
  }

  for (const stat of module.derived) {
    if (stat.formula) inspect(stat.formula, { statKey: stat.key });
    if (stat.formula === undefined && stat.base === undefined) {
      findings.push({
        severity: 'warning',
        code: 'undeclared-target',
        message: `Derived stat \`${stat.key}\` has neither a base nor a formula, so it starts at 0.`,
        statKey: stat.key,
      });
    }
  }

  for (const entity of module.entities) {
    for (const grant of entity.grants ?? []) {
      for (const source of grantFormulas(grant)) {
        inspect(source, { entityKey: entity.key });
      }
    }
  }
}

function checkEntities(module: SystemModule, findings: LintFinding[], maxLevel: number): void {
  // Attribute score and modifier paths are declared by the attribute, not by a
  // derived stat. Omitting them here made every species that raises an ability
  // score look like it targeted something undeclared.
  const declared = new Set([
    ...module.derived.map((s) => s.key),
    ...module.attributes.flatMap((a) => [`attr.${a.key}.score`, `attr.${a.key}.mod`]),
  ]);

  for (const entity of module.entities) {
    const grants = entity.grants ?? [];

    const hasData = entity.data !== undefined && Object.keys(entity.data).length > 0;
    if (grants.length === 0 && !hasData) {
      findings.push({
        severity: 'info',
        code: 'inert-entity',
        message: `\`${entity.name}\` has no effects and no details, so taking it changes nothing.`,
        entityKey: entity.key,
      });
    }

    for (const grant of grants) {
      if (grant.atLevel !== undefined && grant.atLevel > maxLevel) {
        findings.push({
          severity: 'warning',
          code: 'unreachable-grant',
          message: `\`${entity.name}\` grants something at level ${grant.atLevel}, beyond the maximum of ${maxLevel}.`,
          entityKey: entity.key,
        });
      }

      for (const effect of grant.effects) {
        if (effect.kind !== 'numeric') continue;
        if (!declared.has(effect.target)) {
          findings.push({
            severity: 'warning',
            code: 'undeclared-target',
            message: `\`${entity.name}\` changes \`${effect.target}\`, which the system never declares — it will compute but not appear on the sheet.`,
            entityKey: entity.key,
            statKey: effect.target,
          });
        }
      }
    }
  }
}

function checkUnusedAttributes(module: SystemModule, findings: LintFinding[]): void {
  const referenced = new Set<string>();

  const collect = (source: string) => {
    const parsed = Formula.tryParse(source);
    if (parsed.ok) for (const reference of parsed.formula.references) referenced.add(reference);
  };

  for (const stat of module.derived) if (stat.formula) collect(stat.formula);
  for (const attribute of module.attributes) if (attribute.modifier) collect(attribute.modifier);
  for (const entity of module.entities) {
    for (const grant of entity.grants ?? [])
      for (const source of grantFormulas(grant)) collect(source);
  }

  for (const attribute of module.attributes) {
    const used =
      referenced.has(`attr.${attribute.key}.mod`) || referenced.has(`attr.${attribute.key}.score`);

    // A self-referencing modifier does not count as use: `floor(attr.str.score / 2)`
    // on `str` itself proves nothing about whether anything reads str.
    const selfOnly =
      attribute.modifier !== undefined &&
      [
        ...(Formula.tryParse(attribute.modifier).ok
          ? Formula.parse(attribute.modifier).references
          : []),
      ].every((r) => r.startsWith(`attr.${attribute.key}.`));

    if (!used || (selfOnly && !hasExternalUse(module, attribute.key))) {
      findings.push({
        severity: 'info',
        code: 'unused-attribute',
        message: `Nothing reads \`${attribute.name}\`. It will appear on sheets but affect nothing.`,
        attributeKey: attribute.key,
      });
    }
  }
}

function hasExternalUse(module: SystemModule, attributeKey: string): boolean {
  const paths = [`attr.${attributeKey}.mod`, `attr.${attributeKey}.score`];

  const uses = (source: string) => {
    const parsed = Formula.tryParse(source);
    return parsed.ok && paths.some((p) => parsed.formula.references.has(p));
  };

  for (const stat of module.derived) if (stat.formula && uses(stat.formula)) return true;
  for (const entity of module.entities) {
    for (const grant of entity.grants ?? []) {
      if (grantFormulas(grant).some(uses)) return true;
    }
  }
  return false;
}

// --- probes -----------------------------------------------------------------

export interface ProbeResult {
  label: string;
  level: number;
  findings: LintFinding[];
}

/**
 * Generates characters across the level range and resolves each one.
 *
 * A system can pass every static check and still produce a broken sheet at
 * level 14 because one formula divides by a stat that is zero there. Only
 * actually resolving finds that, and doing it per level is cheap.
 */
export function probeCharacters(module: SystemModule, options: LintOptions = {}): ProbeResult[] {
  const maxLevel = options.maxLevel ?? DEFAULTS.maxLevel;
  const absurd = options.absurdThreshold ?? DEFAULTS.absurdThreshold;

  const attributes = Object.fromEntries(
    module.attributes.map((a) => [a.key, a.default ?? 10]),
  ) as Record<string, number>;

  const classes = module.entities.filter((e) => e.type === 'class');
  const species = module.entities.filter((e) => e.type === 'species');

  // One probe per class, plus a classless one so systems with no classes are
  // still exercised.
  const subjects: { label: string; make: (level: number) => CharacterBuild }[] =
    classes.length > 0
      ? classes.map((klass: ModuleEntity) => ({
          label: klass.name,
          make: (level: number): CharacterBuild => ({
            attributes,
            taken: species[0] ? [species[0].key] : [],
            classes: [{ key: klass.key, level }],
          }),
        }))
      : [
          {
            label: 'classless',
            make: (): CharacterBuild => ({
              attributes,
              taken: species[0] ? [species[0].key] : [],
            }),
          },
        ];

  const results: ProbeResult[] = [];
  const levels = classes.length > 0 ? range(1, maxLevel) : [1];

  for (const subject of subjects) {
    for (const level of levels) {
      const findings: LintFinding[] = [];

      try {
        const input = compile(module, subject.make(level));
        const sheet = resolve({
          ...input,
          ...(module.proficiencyScale ? { proficiencyScale: module.proficiencyScale } : {}),
        });

        for (const diagnostic of sheet.diagnostics) {
          findings.push({
            severity: diagnostic.severity === 'error' ? 'error' : 'warning',
            code:
              diagnostic.code === 'circular-dependency'
                ? 'circular-dependency'
                : 'unknown-reference',
            message: diagnostic.message,
            ...(diagnostic.target !== undefined ? { statKey: diagnostic.target } : {}),
            ...(diagnostic.sourceId !== undefined ? { entityKey: diagnostic.sourceId } : {}),
          });
        }

        for (const [key, value] of Object.entries(sheet.stats)) {
          if (!Number.isFinite(value.value)) {
            findings.push({
              severity: 'error',
              code: 'probe-failure',
              message: `\`${key}\` is not a finite number at level ${level}.`,
              statKey: key,
            });
          } else if (Math.abs(value.value) > absurd) {
            findings.push({
              severity: 'warning',
              code: 'probe-failure',
              message: `\`${key}\` reaches ${value.value} at level ${level}, which is probably not intended.`,
              statKey: key,
            });
          }
        }
      } catch (error) {
        // Resolution is meant to degrade, never throw. If it does, that is the
        // most serious finding the linter can produce.
        findings.push({
          severity: 'error',
          code: 'probe-failure',
          message: `Resolving a level ${level} ${subject.label} threw: ${
            error instanceof Error ? error.message : String(error)
          }`,
        });
      }

      if (findings.length > 0) results.push({ label: subject.label, level, findings });
    }
  }

  return results;
}

const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

// --- entry point ------------------------------------------------------------

export interface LintReport {
  findings: LintFinding[];
  probes: ProbeResult[];
  counts: Record<LintSeverity, number>;
}

export function lintSystem(module: SystemModule, options: LintOptions = {}): LintReport {
  const findings: LintFinding[] = [];

  checkDuplicates(module, findings);
  checkFormulas(module, findings);
  checkEntities(module, findings, options.maxLevel ?? DEFAULTS.maxLevel);
  checkUnusedAttributes(module, findings);

  const probes = probeCharacters(module, options);

  const counts: Record<LintSeverity, number> = { error: 0, warning: 0, info: 0 };
  for (const finding of findings) counts[finding.severity] += 1;
  for (const probe of probes) for (const finding of probe.findings) counts[finding.severity] += 1;

  return { findings, probes, counts };
}
