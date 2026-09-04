import { fileURLToPath } from 'node:url';
import { dnd5e2014, dnd5e2024 } from '@ttrpg/systems-dnd5e';
import { config } from 'dotenv';
import { beforeAll, describe, expect, it } from 'vitest';
import { type Database, createDatabase } from './client.js';
import {
  compendiumFacets,
  findByEffect,
  getEntity,
  listSystems,
  searchCompendium,
} from './queries.js';
import { ensureSystemAccount, seedSystemModule } from './seed.js';

/**
 * Integration tests against a real Postgres.
 *
 * These run against the same database the app uses, seeded idempotently. They
 * are skipped rather than failed when DATABASE_URL is absent, so a contributor
 * without Docker running still gets a green unit suite — but CI always has one,
 * so the coverage is never quietly lost.
 */
// Load the repo-root .env so a local `pnpm test` exercises these instead of
// silently skipping. dotenv does not override an existing value, so CI's
// workflow-supplied DATABASE_URL still wins.
config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });

const connectionString = process.env.DATABASE_URL;
const describeDb = connectionString ? describe : describe.skip;

describeDb('compendium queries', () => {
  let db: Database;

  beforeAll(async () => {
    db = createDatabase(connectionString!);
    const ownerId = await ensureSystemAccount(db);
    await seedSystemModule(db, dnd5e2014, ownerId);
    await seedSystemModule(db, dnd5e2024, ownerId);
  }, 30_000);

  it('seeding is idempotent', async () => {
    const before = await searchCompendium(db, { systemSlug: 'dnd5e-2014' });
    const ownerId = await ensureSystemAccount(db);
    await seedSystemModule(db, dnd5e2014, ownerId);
    const after = await searchCompendium(db, { systemSlug: 'dnd5e-2014' });
    expect(after.total).toBe(before.total);
  });

  it('lists both bundled rulesets', async () => {
    const slugs = (await listSystems(db)).map((s) => s.slug);
    expect(slugs).toContain('dnd5e-2014');
    expect(slugs).toContain('dnd5e-2024');
  });

  it('scopes results to one ruleset', async () => {
    const results = await searchCompendium(db, { systemSlug: 'dnd5e-2024' });
    expect(results.entries.length).toBeGreaterThan(0);
    expect(results.entries.every((e) => e.systemSlug === 'dnd5e-2024')).toBe(true);
  });

  it('searches by name, case-insensitively', async () => {
    const results = await searchCompendium(db, { systemSlug: 'dnd5e-2014', search: 'fireBALL' });
    expect(results.entries.map((e) => e.key)).toContain('fireball');
  });

  it('falls back to matching the key, so underscored paths are findable', async () => {
    const results = await searchCompendium(db, { systemSlug: 'dnd5e-2014', search: 'ring-of' });
    expect(results.entries.map((e) => e.key)).toContain('ring-of-protection');
  });

  it('treats % and _ in a search term as literals, not wildcards', async () => {
    // Otherwise a user typing `_` matches everything, which looks like a bug.
    const results = await searchCompendium(db, { systemSlug: 'dnd5e-2014', search: '%' });
    expect(results.total).toBe(0);
  });

  it('filters by type', async () => {
    const results = await searchCompendium(db, { systemSlug: 'dnd5e-2014', types: ['item'] });
    expect(results.entries.length).toBeGreaterThan(0);
    expect(results.entries.every((e) => e.type === 'item')).toBe(true);
  });

  it('returns type facets with counts', async () => {
    const facets = await compendiumFacets(db, { systemSlug: 'dnd5e-2014' });
    const item = facets.find((f) => f.type === 'item');
    expect(item?.count).toBeGreaterThan(0);
  });

  it('facet counts ignore the type filter, so the sidebar stays navigable', async () => {
    const unfiltered = await compendiumFacets(db, { systemSlug: 'dnd5e-2014' });
    const filtered = await compendiumFacets(db, { systemSlug: 'dnd5e-2014', types: ['item'] });
    expect(filtered).toEqual(unfiltered);
  });

  it('fetches a single entity with its mechanics', async () => {
    const entity = await getEntity(db, 'dnd5e-2014', 'ring-of-protection');
    expect(entity?.name).toBe('Ring of Protection');
    expect(entity?.grants.length).toBeGreaterThan(0);
  });

  it('returns undefined for an entity in the wrong ruleset', async () => {
    // `dwarf-hill` is 2014 only; 2024 has `dwarf`.
    expect(await getEntity(db, 'dnd5e-2024', 'dwarf-hill')).toBeUndefined();
    expect(await getEntity(db, 'dnd5e-2014', 'dwarf-hill')).toBeDefined();
  });

  describe('structured effect queries', () => {
    it('finds everything that touches a given stat', async () => {
      const results = await findByEffect(db, { systemSlug: 'dnd5e-2014', target: 'ac' });
      const keys = results.map((r) => r.key);
      expect(keys).toContain('chain-mail');
      expect(keys).toContain('shield');
      expect(keys).toContain('ring-of-protection');
      expect(keys).toContain('mage-armour');
      expect(keys).toContain('style-defense');
      // Fireball has no mechanical effects encoded, so it must not appear.
      expect(keys).not.toContain('fireball');
    });

    it('finds every source of a given effect kind', async () => {
      const results = await findByEffect(db, {
        systemSlug: 'dnd5e-2014',
        kind: 'damage-response',
      });
      expect(results.map((r) => r.key)).toContain('dwarf-hill');
    });

    it('respects ruleset scoping', async () => {
      const results = await findByEffect(db, { systemSlug: 'dnd5e-2024', target: 'ac' });
      expect(results.every((r) => r.systemSlug === 'dnd5e-2024')).toBe(true);
    });
  });
});
