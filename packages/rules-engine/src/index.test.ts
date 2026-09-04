import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ENGINE_VERSION, NotImplementedError } from './index.js';

describe('rules-engine phase 0 stub', () => {
  it('exports a version', () => {
    expect(ENGINE_VERSION).toBe('0.0.0-phase0');
  });

  it('NotImplementedError points at the plan', () => {
    const error = new NotImplementedError('resolveCharacter');
    expect(error.message).toContain('resolveCharacter');
    expect(error.message).toContain('Phase 1');
  });
});

/**
 * Guardrail, not ceremony. The zero-dependency rule is what keeps this package
 * isomorphic and offline-capable; it is easy to break by reflex and expensive
 * to walk back once something depends on it. Fail loudly at the moment it goes.
 */
describe('zero-dependency constraint', () => {
  it('declares no runtime dependencies', () => {
    const pkgPath = fileURLToPath(new URL('../package.json', import.meta.url));
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
      dependencies?: Record<string, string>;
    };
    expect(Object.keys(pkg.dependencies ?? {})).toEqual([]);
  });
});
