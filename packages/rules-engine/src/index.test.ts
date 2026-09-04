import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ENGINE_VERSION } from './index.js';

describe('package surface', () => {
  it('exports a version', () => {
    expect(ENGINE_VERSION).toBe('0.1.0');
  });
});

/**
 * Guardrails, not ceremony. Each of these constraints is load-bearing, easy to
 * break by reflex, and expensive to walk back once something depends on the
 * broken state. Fail loudly at the moment one goes.
 */
describe('engine constraints', () => {
  const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

  it('declares no runtime dependencies', () => {
    // Zero deps is what keeps the engine isomorphic and offline-capable.
    const pkg = JSON.parse(readFileSync(here('../package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
    };
    expect(Object.keys(pkg.dependencies ?? {})).toEqual([]);
  });

  it('never reaches for eval or the host environment', async () => {
    // The formula DSL is parsed and interpreted precisely so that untrusted
    // content cannot execute. A regression here is a security bug, not a
    // style issue.
    const { globSync } = await import('node:fs');
    const sources = globSync(here('../src/**/*.ts')).filter((p) => !p.endsWith('.test.ts'));

    // Strip comments first. The prose in this package necessarily *names* the
    // things it forbids, and a scanner that cannot tell code from documentation
    // would fail on its own explanation of why the rule exists.
    const stripComments = (text: string) =>
      text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

    expect(sources.length).toBeGreaterThan(5);
    for (const file of sources) {
      const code = stripComments(readFileSync(file, 'utf8'));
      expect(code, `${file} must not use eval`).not.toMatch(/\beval\s*\(/);
      expect(code, `${file} must not construct functions`).not.toMatch(/new\s+Function\b/);
      expect(code, `${file} must not read process.env`).not.toMatch(/process\s*\.\s*env/);
    }
  });

  it('contains no 5e-specific vocabulary', () => {
    // If a 5e concept appears in the engine, the central architectural bet has
    // been lost — those belong in the dnd5e-* system modules as data.
    const forbidden = [
      /\bspellSlot\b/i,
      /\bproficiencyBonus\b/i,
      /\barmou?rClass\b/i,
      /\bhitDice\b/i,
      /\bSTRENGTH\b/,
      /\bCHARISMA\b/,
    ];

    const sources = [
      'index.ts',
      'effect.ts',
      'resolve.ts',
      'stacking.ts',
      'predicate.ts',
      'formula/evaluate.ts',
      'formula/parse.ts',
      'formula/tokenize.ts',
      'formula/ast.ts',
    ];

    for (const file of sources) {
      const text = readFileSync(here(`./${file}`), 'utf8');
      for (const pattern of forbidden) {
        expect(text, `${file} must not hardcode ${pattern}`).not.toMatch(pattern);
      }
    }
  });
});
