import { describe, expect, it } from 'vitest';
import { Formula } from './formula/index.js';
import { type LintCode, lintSystem, probeCharacters } from './lint.js';
import type { ModuleEntity, SystemModule } from './module.js';

const f = (source: string) => Formula.parse(source);

const system = (overrides: Partial<SystemModule> = {}): SystemModule => ({
  id: 'test',
  name: 'Test System',
  source: { id: 'test', name: 'Test', license: null },
  attributes: [
    {
      key: 'might',
      name: 'Might',
      abbreviation: 'MGT',
      modifier: 'floor(attr.might.score / 3)',
      default: 10,
    },
  ],
  derived: [{ key: 'power', name: 'Power', formula: 'attr.might.mod * 2' }],
  entities: [],
  ...overrides,
});

const codes = (module: SystemModule): LintCode[] =>
  lintSystem(module).findings.map((finding) => finding.code);

describe('a clean system', () => {
  it('reports no errors or warnings', () => {
    const report = lintSystem(system());
    expect(report.counts.error).toBe(0);
    expect(report.counts.warning).toBe(0);
  });
});

describe('formula checks', () => {
  it('catches a reference nothing provides', () => {
    const report = lintSystem(
      system({ derived: [{ key: 'power', name: 'Power', formula: 'attr.gone.mod + 1' }] }),
    );
    const finding = report.findings.find((x) => x.code === 'unknown-reference');
    expect(finding?.severity).toBe('error');
    expect(finding?.message).toContain('attr.gone.mod');
    expect(finding?.statKey).toBe('power');
  });

  it('catches an unparseable formula and says why', () => {
    const report = lintSystem(
      system({ derived: [{ key: 'power', name: 'Power', formula: 'floor(' }] }),
    );
    const finding = report.findings.find((x) => x.code === 'unparseable-formula');
    expect(finding?.severity).toBe('error');
    expect(finding?.message).toMatch(/does not parse/);
  });

  it('checks formulas inside entity effects and predicates', () => {
    const entity: ModuleEntity = {
      key: 'broken',
      type: 'feat',
      name: 'Broken',
      grants: [
        {
          effects: [
            { kind: 'numeric', target: 'power', operation: 'add', value: f('missing.thing') },
          ],
          when: { kind: 'expression', formula: f('also.missing > 1') },
        },
      ],
    };
    const found = lintSystem(system({ entities: [entity] })).findings.filter(
      (x) => x.code === 'unknown-reference',
    );
    expect(found).toHaveLength(2);
    expect(found.every((x) => x.entityKey === 'broken')).toBe(true);
  });

  it('accepts prof.* even for targets nothing declares', () => {
    // The proficiency scale answers for any target, so these always resolve.
    const module = system({
      derived: [{ key: 'stealth', name: 'Stealth', formula: 'prof.skill.anything * 2' }],
    });
    expect(codes(module)).not.toContain('unknown-reference');
  });

  it('accepts a reference created only by an effect target', () => {
    // Nothing declares `grit`, but an effect creates it, so formulas may use it.
    const module = system({
      derived: [{ key: 'power', name: 'Power', formula: 'grit + 1' }],
      entities: [
        {
          key: 'tough',
          type: 'feat',
          name: 'Tough',
          grants: [
            { effects: [{ kind: 'numeric', target: 'grit', operation: 'set', value: f('3') }] },
          ],
        },
      ],
    });
    expect(codes(module)).not.toContain('unknown-reference');
  });
});

describe('key collisions', () => {
  it('catches duplicate attribute keys', () => {
    const module = system({
      attributes: [
        { key: 'might', name: 'Might', abbreviation: 'MGT', default: 10 },
        { key: 'might', name: 'Muscle', abbreviation: 'MSC', default: 10 },
      ],
      derived: [],
    });
    expect(codes(module)).toContain('duplicate-key');
  });

  it('catches a derived stat shadowing an attribute path', () => {
    const module = system({
      derived: [{ key: 'attr.might.mod', name: 'Sneaky', base: 99 }],
    });
    expect(codes(module)).toContain('shadowed-attribute');
  });
});

describe('entity checks', () => {
  it('flags an entity that does nothing at all', () => {
    const module = system({
      entities: [{ key: 'empty', type: 'feat', name: 'Empty' }],
    });
    const finding = lintSystem(module).findings.find((x) => x.code === 'inert-entity');
    expect(finding?.severity).toBe('info');
  });

  it('does not flag an entity that only carries display data', () => {
    const module = system({
      entities: [{ key: 'lore', type: 'item', name: 'Lore', data: { weight: 3 } }],
    });
    expect(codes(module)).not.toContain('inert-entity');
  });

  it('flags a grant beyond the maximum level', () => {
    const module = system({
      entities: [
        {
          key: 'late',
          type: 'class',
          name: 'Late Bloomer',
          grants: [
            {
              atLevel: 25,
              effects: [{ kind: 'numeric', target: 'power', operation: 'add', value: f('1') }],
            },
          ],
        },
      ],
    });
    expect(codes(module)).toContain('unreachable-grant');
  });

  it('warns when an effect targets a stat the system never declares', () => {
    const module = system({
      entities: [
        {
          key: 'ghost',
          type: 'feat',
          name: 'Ghost',
          grants: [
            { effects: [{ kind: 'numeric', target: 'phantom', operation: 'add', value: f('1') }] },
          ],
        },
      ],
    });
    const finding = lintSystem(module).findings.find(
      (x) => x.code === 'undeclared-target' && x.statKey === 'phantom',
    );
    expect(finding?.severity).toBe('warning');
    expect(finding?.message).toMatch(/not appear on the sheet/);
  });
});

describe('unused attributes', () => {
  it('flags an attribute nothing reads', () => {
    const module = system({
      attributes: [
        {
          key: 'might',
          name: 'Might',
          abbreviation: 'MGT',
          modifier: 'floor(attr.might.score / 3)',
          default: 10,
        },
        {
          key: 'lonely',
          name: 'Lonely',
          abbreviation: 'LNL',
          modifier: 'floor(attr.lonely.score / 3)',
          default: 10,
        },
      ],
    });
    const finding = lintSystem(module).findings.find(
      (x) => x.code === 'unused-attribute' && x.attributeKey === 'lonely',
    );
    expect(finding?.severity).toBe('info');
  });

  it('does not flag an attribute an entity effect reads', () => {
    const module = system({
      attributes: [
        {
          key: 'might',
          name: 'Might',
          abbreviation: 'MGT',
          modifier: 'floor(attr.might.score / 3)',
          default: 10,
        },
        {
          key: 'grace',
          name: 'Grace',
          abbreviation: 'GRC',
          modifier: 'floor(attr.grace.score / 3)',
          default: 10,
        },
      ],
      entities: [
        {
          key: 'dodge',
          type: 'feat',
          name: 'Dodge',
          grants: [
            {
              effects: [
                { kind: 'numeric', target: 'power', operation: 'add', value: f('attr.grace.mod') },
              ],
            },
          ],
        },
      ],
    });
    expect(
      lintSystem(module).findings.some(
        (x) => x.code === 'unused-attribute' && x.attributeKey === 'grace',
      ),
    ).toBe(false);
  });
});

describe('probe characters', () => {
  it('finds nothing wrong with a healthy system', () => {
    expect(probeCharacters(system())).toEqual([]);
  });

  it('catches a division by zero that only appears at runtime', () => {
    // Statically this formula is fine — every reference exists. It only breaks
    // when `power` resolves to 0, which no static check can know.
    const module = system({
      derived: [
        { key: 'power', name: 'Power', base: 0 },
        { key: 'ratio', name: 'Ratio', formula: '100 / power' },
      ],
    });
    const probes = probeCharacters(module);
    expect(probes.length).toBeGreaterThan(0);
    expect(probes[0]!.findings.some((x) => x.message.includes('Division by zero'))).toBe(true);
  });

  it('catches a value that runs away with level', () => {
    const module = system({
      derived: [{ key: 'power', name: 'Power', formula: 'level * level * 1000' }],
      entities: [{ key: 'brute', type: 'class', name: 'Brute' }],
    });
    const probes = probeCharacters(module, { absurdThreshold: 5000 });
    expect(probes.some((p) => p.findings.some((x) => x.code === 'probe-failure'))).toBe(true);
    // Low levels stay under the threshold, so this must not fire everywhere.
    expect(probes.some((p) => p.level === 1)).toBe(false);
  });

  it('reports a circular dependency rather than hanging', () => {
    const module = system({
      derived: [
        { key: 'a', name: 'A', formula: 'b + 1' },
        { key: 'b', name: 'B', formula: 'a + 1' },
      ],
    });
    const probes = probeCharacters(module);
    expect(probes[0]?.findings.some((x) => x.code === 'circular-dependency')).toBe(true);
  });

  it('probes one build per class per level', () => {
    const module = system({
      entities: [
        { key: 'brute', type: 'class', name: 'Brute' },
        { key: 'sage', type: 'class', name: 'Sage' },
      ],
      derived: [{ key: 'power', name: 'Power', formula: '1 / 0' }],
    });
    const probes = probeCharacters(module, { maxLevel: 3 });
    expect(probes).toHaveLength(6);
    expect(new Set(probes.map((p) => p.label))).toEqual(new Set(['Brute', 'Sage']));
  });
});

describe('report shape', () => {
  it('counts findings by severity across static checks and probes', () => {
    const module = system({
      derived: [{ key: 'power', name: 'Power', formula: 'attr.gone.mod' }],
      entities: [{ key: 'empty', type: 'feat', name: 'Empty' }],
    });
    const report = lintSystem(module);
    expect(report.counts.error).toBeGreaterThan(0);
    expect(report.counts.info).toBeGreaterThan(0);
    expect(report.counts.error + report.counts.warning + report.counts.info).toBe(
      report.findings.length + report.probes.reduce((n, p) => n + p.findings.length, 0),
    );
  });
});
