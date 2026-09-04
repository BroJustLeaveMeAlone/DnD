import { lintSystem } from '@ttrpg/rules-engine';
import { describe, expect, it } from 'vitest';
import { dnd5e2014 } from './dnd5e-2014.js';
import { dnd5e2024 } from './dnd5e-2024.js';

/**
 * The linter run against the bundled rulesets.
 *
 * These are the most carefully authored content in the project, so if the
 * linter fires on them it is either finding a real mistake or is itself wrong.
 * Either way it needs looking at, which is why this is a test rather than a
 * one-off check.
 */
describe.each([
  ['dnd5e-2014', dnd5e2014],
  ['dnd5e-2024', dnd5e2024],
])('%s passes its own linter', (_name, module) => {
  const report = lintSystem(module);

  it('has no errors', () => {
    expect(report.findings.filter((f) => f.severity === 'error')).toEqual([]);
  });

  it('has no warnings', () => {
    expect(report.findings.filter((f) => f.severity === 'warning')).toEqual([]);
  });

  it('produces no probe failures at any level', () => {
    // Every class, levels 1 through 20, resolved and checked.
    expect(report.probes).toEqual([]);
  });
});
