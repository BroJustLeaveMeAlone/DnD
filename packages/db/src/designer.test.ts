import { fileURLToPath } from 'node:url';
import { compile, resolve } from '@ttrpg/rules-engine';
import { dnd5e2014 } from '@ttrpg/systems-dnd5e';
import { config } from 'dotenv';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  forkSystem,
  getOwnedSystem,
  updateSystemDefinition,
  updateSystemDials,
  upsertEntity,
} from './authoring.js';
import { loadSystemModule } from './characters.js';
import { type Database, createDatabase } from './client.js';
import { ensureSystemAccount, seedSystemModule } from './seed.js';
import { findOrCreateUser } from './sessions.js';

config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });

const connectionString = process.env.DATABASE_URL;
const describeDb = connectionString ? describe : describe.skip;
const unique = () => Math.random().toString(36).slice(2, 8);

/**
 * The System Designer's real test: build a system with no 5e concepts in it —
 * no ability scores, no AC, no spell slots, no class levels — entirely through
 * the same data path a user would, and confirm it resolves.
 *
 * The engine already proves this in-memory (see golden.test.ts). This proves it
 * survives the database: definitions stored as JSONB, entities serialised, and
 * a module reconstructed from rows.
 */
describeDb('system designer', () => {
  let db: Database;
  let ownerId: string;

  beforeAll(async () => {
    db = createDatabase(connectionString!);
    await seedSystemModule(db, dnd5e2014, await ensureSystemAccount(db));
    ownerId = await findOrCreateUser(db, {
      email: 'designer@test.local',
      name: 'Designer',
      handle: `designer-${unique()}`,
    });
  }, 30_000);

  it('stores and reloads dial settings', async () => {
    const slug = `dials-${unique()}`;
    await forkSystem(db, { sourceSlug: 'dnd5e-2014', ownerId, slug, name: 'Dials' });

    await updateSystemDials(db, {
      systemSlug: slug,
      ownerId,
      dials: { attributes: 'replaced', powers: 'replaced', 'combat-resolution': 'inherited' },
    });

    const system = await getOwnedSystem(db, slug, ownerId);
    expect(system?.dials).toEqual({
      attributes: 'replaced',
      powers: 'replaced',
      'combat-resolution': 'inherited',
    });
  });

  it('refuses design writes from a non-owner', async () => {
    const slug = `guard-${unique()}`;
    await forkSystem(db, { sourceSlug: 'dnd5e-2014', ownerId, slug, name: 'Guarded' });
    const stranger = await findOrCreateUser(db, {
      email: 'other-designer@test.local',
      name: 'Other',
      handle: `other-${unique()}`,
    });

    expect(
      await updateSystemDefinition(db, {
        systemSlug: slug,
        ownerId: stranger,
        definition: { attributes: [], derived: [] },
      }),
    ).toBe(false);
    expect(await updateSystemDials(db, { systemSlug: slug, ownerId: stranger, dials: {} })).toBe(
      false,
    );
  });

  describe('a system with no 5e concepts, built through the database', () => {
    let slug: string;

    beforeAll(async () => {
      slug = `jjk-${unique()}`;
      await forkSystem(db, { sourceSlug: 'dnd5e-2014', ownerId, slug, name: 'Jujutsu' });

      // Replace the entire definition. Nothing 5e survives.
      await updateSystemDefinition(db, {
        systemSlug: slug,
        ownerId,
        definition: {
          attributes: [
            {
              key: 'cursed_energy',
              name: 'Cursed Energy',
              abbreviation: 'CE',
              modifier: 'floor(attr.cursed_energy.score / 3)',
              default: 10,
            },
            {
              key: 'body',
              name: 'Body',
              abbreviation: 'BDY',
              modifier: 'floor(attr.body.score / 3)',
              default: 10,
            },
          ],
          derived: [
            { key: 'grade', name: 'Grade', base: 0 },
            {
              key: 'output',
              name: 'Technique Output',
              formula: 'attr.cursed_energy.mod * (grade + 1)',
            },
            { key: 'barrier', name: 'Barrier', formula: '5 + attr.body.mod' },
          ],
          proficiencyScale: { none: 0, half: 0, proficient: 1, expertise: 1 },
        },
      });

      await upsertEntity(db, {
        systemSlug: slug,
        ownerId,
        draft: {
          key: 'special-grade',
          type: 'feat',
          name: 'Special Grade',
          grants: [
            { effects: [{ kind: 'numeric', target: 'grade', operation: 'set', value: '4' }] },
          ],
        },
      });

      await upsertEntity(db, {
        systemSlug: slug,
        ownerId,
        draft: {
          key: 'domain-expansion',
          type: 'feat',
          name: 'Domain Expansion',
          grants: [
            {
              effects: [
                { kind: 'numeric', target: 'output', operation: 'add', value: '20' },
                { kind: 'roll-bias', target: 'technique', bias: 'advantage' },
                {
                  kind: 'resource',
                  target: 'domain_uses',
                  max: 'grade',
                  recharge: 'long-rest',
                },
              ],
              when: { kind: 'flag', flag: 'domain-active' },
              detail: 'domain open',
            },
          ],
        },
      });
    }, 30_000);

    const build = {
      attributes: { cursed_energy: 42, body: 30 },
      taken: ['special-grade', 'domain-expansion'],
      classes: [],
      inventory: [],
    };

    it('reconstructs a module with entirely custom attributes', async () => {
      const module = await loadSystemModule(db, slug);
      expect(module!.attributes.map((a) => a.key)).toEqual(['cursed_energy', 'body']);
      expect(module!.attributes.some((a) => a.key === 'str')).toBe(false);
      expect(module!.proficiencyScale?.expertise).toBe(1);
    });

    it('resolves a character with no 5e stats at all', async () => {
      const module = await loadSystemModule(db, slug);
      const sheet = resolve({
        ...compile(module!, build),
        ...(module!.proficiencyScale ? { proficiencyScale: module!.proficiencyScale } : {}),
      });

      expect(sheet.diagnostics).toEqual([]);
      expect(sheet.stats['attr.cursed_energy.mod']?.value).toBe(14);
      expect(sheet.stats.grade?.value).toBe(4);
      // 14 * (4 + 1)
      expect(sheet.stats.output?.value).toBe(70);
      expect(sheet.stats.barrier?.value).toBe(15);

      // No 5e stat exists in this system.
      expect(sheet.stats.ac).toBeUndefined();
      expect(sheet.stats['attr.str.mod']).toBeUndefined();
    });

    it('gates a custom conditional and shows why when it is off', async () => {
      const module = await loadSystemModule(db, slug);
      const scale = module!.proficiencyScale ? { proficiencyScale: module!.proficiencyScale } : {};

      const closed = resolve({ ...compile(module!, build), ...scale });
      const open = resolve({
        ...compile(module!, { ...build, flags: ['domain-active'] }),
        ...scale,
      });

      expect(open.stats.output!.value - closed.stats.output!.value).toBe(20);
      expect(open.advantage.technique).toHaveLength(1);
      expect(open.resources.domain_uses?.max).toBe(4);

      const suppressed = closed.stats.output!.trace.find(
        (e) => e.sourceName === 'Domain Expansion',
      );
      expect(suppressed?.applied).toBe(false);
      expect(suppressed?.suppressedBy).toBe('its condition is not met');
    });

    it('reports a diagnostic when a formula references a removed attribute', async () => {
      // The destructive end of the designer. The sheet must degrade with a
      // named diagnostic rather than crash — Phase 7's linter turns this into a
      // warning the author sees before a player does.
      const broken = `broken-${unique()}`;
      await forkSystem(db, { sourceSlug: 'dnd5e-2014', ownerId, slug: broken, name: 'Broken' });
      await updateSystemDefinition(db, {
        systemSlug: broken,
        ownerId,
        definition: {
          attributes: [],
          derived: [{ key: 'ruin', name: 'Ruin', formula: 'attr.gone.mod + 1' }],
        },
      });

      const module = await loadSystemModule(db, broken);
      const sheet = resolve(compile(module!, { attributes: {}, taken: [], classes: [] }));

      expect(sheet.diagnostics.some((d) => d.code === 'unknown-reference')).toBe(true);
      expect(sheet.stats.ruin?.value).toBe(0);
    });
  });
});
