import { fileURLToPath } from 'node:url';
import { buildSheet, dnd5e2014 } from '@ttrpg/systems-dnd5e';
import { config } from 'dotenv';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  deleteEntity,
  entitiesForCharacter,
  forkSystem,
  listOwnedSystems,
  upsertEntity,
} from './authoring.js';
import { createCharacter, deleteCharacter, loadSystemModule } from './characters.js';
import { type Database, createDatabase } from './client.js';
import { getEntity, searchCompendium } from './queries.js';
import { ensureSystemAccount, seedSystemModule } from './seed.js';
import { findOrCreateUser } from './sessions.js';

config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });

const connectionString = process.env.DATABASE_URL;
const describeDb = connectionString ? describe : describe.skip;

const unique = () => Math.random().toString(36).slice(2, 8);

describeDb('homebrew authoring', () => {
  let db: Database;
  let ownerId: string;
  let strangerId: string;

  beforeAll(async () => {
    db = createDatabase(connectionString!);
    const systemAccount = await ensureSystemAccount(db);
    await seedSystemModule(db, dnd5e2014, systemAccount);

    ownerId = await findOrCreateUser(db, {
      email: 'author@test.local',
      name: 'Author',
      handle: `author-${unique()}`,
    });
    strangerId = await findOrCreateUser(db, {
      email: 'stranger@test.local',
      name: 'Stranger',
      handle: `stranger-${unique()}`,
    });
  }, 30_000);

  describe('forking', () => {
    it('copies every entity into a system the user owns', async () => {
      const slug = `fork-${unique()}`;
      const result = await forkSystem(db, {
        sourceSlug: 'dnd5e-2014',
        ownerId,
        slug,
        name: 'My Fork',
      });

      expect(result.copiedEntities).toBeGreaterThan(20);
      const owned = await listOwnedSystems(db, ownerId);
      expect(owned.map((s) => s.slug)).toContain(slug);

      // A fork must be usable immediately, not just present.
      const module = await loadSystemModule(db, slug);
      const sheet = buildSheet(module!, {
        attributes: { str: 16, dex: 14, con: 15, int: 10, wis: 12, cha: 8 },
        taken: ['human', 'soldier'],
        classes: [{ key: 'fighter', level: 5 }],
        inventory: [{ key: 'chain-mail', equipped: true }],
      });
      expect(sheet.diagnostics).toEqual([]);
      expect(sheet.stats.ac?.value).toBe(16);
    });

    it('is a snapshot — editing the fork does not touch the original', async () => {
      const slug = `snapshot-${unique()}`;
      await forkSystem(db, { sourceSlug: 'dnd5e-2014', ownerId, slug, name: 'Snapshot' });

      await upsertEntity(db, {
        systemSlug: slug,
        ownerId,
        draft: {
          key: 'shield',
          type: 'item',
          name: 'Aegis',
          grants: [{ effects: [{ kind: 'numeric', target: 'ac', operation: 'add', value: '99' }] }],
        },
      });

      expect((await getEntity(db, slug, 'shield'))?.name).toBe('Aegis');
      expect((await getEntity(db, 'dnd5e-2014', 'shield'))?.name).toBe('Shield');
    });

    it('rejects a duplicate slug', async () => {
      const slug = `dupe-${unique()}`;
      await forkSystem(db, { sourceSlug: 'dnd5e-2014', ownerId, slug, name: 'One' });
      await expect(
        forkSystem(db, { sourceSlug: 'dnd5e-2014', ownerId, slug, name: 'Two' }),
      ).rejects.toThrow();
    });

    it('rejects forking a system that does not exist', async () => {
      await expect(
        forkSystem(db, { sourceSlug: 'nope', ownerId, slug: `x-${unique()}`, name: 'X' }),
      ).rejects.toThrow(/Unknown system/);
    });
  });

  describe('authoring permissions', () => {
    it('refuses writes to a system the caller does not own', async () => {
      const slug = `perm-${unique()}`;
      await forkSystem(db, { sourceSlug: 'dnd5e-2014', ownerId, slug, name: 'Mine' });

      const draft = { key: 'intruder', type: 'feat', name: 'Intruder' };
      expect(await upsertEntity(db, { systemSlug: slug, ownerId: strangerId, draft })).toBe(false);
      expect(await getEntity(db, slug, 'intruder')).toBeUndefined();

      expect(await deleteEntity(db, { systemSlug: slug, ownerId: strangerId, key: 'shield' })).toBe(
        false,
      );
      expect(await getEntity(db, slug, 'shield')).toBeDefined();
    });

    it('refuses writes to the bundled rulesets', async () => {
      // They are owned by the system account, so no ordinary user can edit them.
      expect(
        await upsertEntity(db, {
          systemSlug: 'dnd5e-2014',
          ownerId,
          draft: { key: 'sabotage', type: 'feat', name: 'Sabotage' },
        }),
      ).toBe(false);
    });
  });

  describe('authored content drives real sheet math', () => {
    it('a homebrew feat changes the computed sheet', async () => {
      const slug = `homebrew-${unique()}`;
      await forkSystem(db, { sourceSlug: 'dnd5e-2014', ownerId, slug, name: 'Homebrew' });

      await upsertEntity(db, {
        systemSlug: slug,
        ownerId,
        draft: {
          key: 'iron-hide',
          type: 'feat',
          name: 'Iron Hide',
          grants: [
            {
              effects: [
                {
                  kind: 'numeric',
                  target: 'ac',
                  operation: 'add',
                  value: '2',
                  bonusType: 'natural',
                },
                { kind: 'damage-response', target: 'slashing', response: 'resistance' },
              ],
            },
          ],
        },
      });

      const module = await loadSystemModule(db, slug);
      const base = {
        attributes: { str: 16, dex: 14, con: 15, int: 10, wis: 12, cha: 8 },
        classes: [{ key: 'fighter', level: 5 }],
        inventory: [{ key: 'chain-mail', equipped: true }],
      };

      const without = buildSheet(module!, { ...base, taken: ['human'] });
      const with_ = buildSheet(module!, { ...base, taken: ['human', 'iron-hide'] });

      expect(with_.stats.ac!.value - without.stats.ac!.value).toBe(2);
      expect(with_.damageResponses.slashing).toBe('resistance');
      expect(with_.diagnostics).toEqual([]);

      const trace = with_.stats.ac!.trace.find((e) => e.sourceName === 'Iron Hide');
      expect(trace?.applied).toBe(true);
      expect(trace?.bonusType).toBe('natural');
    });

    it('a conditional homebrew effect survives the round-trip and gates correctly', async () => {
      const slug = `conditional-${unique()}`;
      await forkSystem(db, { sourceSlug: 'dnd5e-2014', ownerId, slug, name: 'Conditional' });

      await upsertEntity(db, {
        systemSlug: slug,
        ownerId,
        draft: {
          key: 'blood-frenzy',
          type: 'feat',
          name: 'Blood Frenzy',
          grants: [
            {
              effects: [{ kind: 'numeric', target: 'ac', operation: 'add', value: '3' }],
              when: { kind: 'flag', flag: 'bloodied' },
              detail: 'while bloodied',
            },
          ],
        },
      });

      const module = await loadSystemModule(db, slug);
      const base = {
        attributes: { str: 16, dex: 14, con: 15, int: 10, wis: 12, cha: 8 },
        taken: ['human', 'blood-frenzy'],
        classes: [{ key: 'fighter', level: 5 }],
        inventory: [{ key: 'chain-mail', equipped: true }],
      };

      const calm = buildSheet(module!, base);
      const bloodied = buildSheet(module!, { ...base, flags: ['bloodied'] });

      expect(bloodied.stats.ac!.value - calm.stats.ac!.value).toBe(3);
      const suppressed = calm.stats.ac!.trace.find((e) => e.sourceName === 'Blood Frenzy');
      expect(suppressed?.applied).toBe(false);
      expect(suppressed?.suppressedBy).toBe('its condition is not met');
    });

    it('bumps the version on edit so pinned consumers can opt in', async () => {
      const slug = `version-${unique()}`;
      await forkSystem(db, { sourceSlug: 'dnd5e-2014', ownerId, slug, name: 'Versioned' });

      const draft = { key: 'tweak', type: 'feat', name: 'Tweak' };
      await upsertEntity(db, { systemSlug: slug, ownerId, draft });
      const { entries: first } = await searchCompendium(db, { systemSlug: slug, search: 'Tweak' });

      await upsertEntity(db, { systemSlug: slug, ownerId, draft: { ...draft, name: 'Tweak II' } });
      const after = await getEntity(db, slug, 'tweak');

      expect(first).toHaveLength(1);
      expect(after?.name).toBe('Tweak II');
    });
  });

  describe('character-scoped content', () => {
    it('is visible to its own character and hidden from others', async () => {
      const slug = `scoped-${unique()}`;
      await forkSystem(db, { sourceSlug: 'dnd5e-2014', ownerId, slug, name: 'Scoped' });

      const build = {
        attributes: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
        taken: ['human'],
        classes: [{ key: 'fighter', level: 1 }],
      };
      const mine = await createCharacter(db, { ownerId, systemSlug: slug, name: 'Mine', build });
      const other = await createCharacter(db, { ownerId, systemSlug: slug, name: 'Other', build });

      await upsertEntity(db, {
        systemSlug: slug,
        ownerId,
        draft: {
          key: 'limitless',
          type: 'feat',
          name: 'Limitless',
          characterId: mine,
          grants: [{ effects: [{ kind: 'numeric', target: 'ac', operation: 'add', value: '5' }] }],
        },
      });

      const forMine = await entitiesForCharacter(db, mine);
      const forOther = await entitiesForCharacter(db, other);

      expect(forMine.map((e) => e.key)).toContain('limitless');
      expect(forOther.map((e) => e.key)).not.toContain('limitless');
      // Both still see the shared library.
      expect(forOther.map((e) => e.key)).toContain('shield');

      // And it stays out of the shared compendium listing entirely.
      const { entries } = await searchCompendium(db, { systemSlug: slug, search: 'Limitless' });
      expect(entries).toHaveLength(0);

      await deleteCharacter(db, mine, ownerId);
      await deleteCharacter(db, other, ownerId);
    });

    it('lets two characters each own an entity with the same key', async () => {
      // Character-scoped content is usually unique to a person but not uniquely
      // *named*: two JJK sorcerers can both have a technique keyed `domain`.
      // A unique constraint on (system, key) alone would make the second save
      // overwrite the first character's private content instead of failing.
      const slug = `collide-${unique()}`;
      await forkSystem(db, { sourceSlug: 'dnd5e-2014', ownerId, slug, name: 'Collide' });

      const build = {
        attributes: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
        taken: ['human'],
        classes: [{ key: 'fighter', level: 1 }],
      };
      const a = await createCharacter(db, { ownerId, systemSlug: slug, name: 'A', build });
      const b = await createCharacter(db, { ownerId, systemSlug: slug, name: 'B', build });

      const technique = (characterId: string, name: string, bonus: string) => ({
        key: 'signature-technique',
        type: 'feat' as const,
        name,
        characterId,
        grants: [
          {
            effects: [
              { kind: 'numeric' as const, target: 'ac', operation: 'add' as const, value: bonus },
            ],
          },
        ],
      });

      expect(
        await upsertEntity(db, { systemSlug: slug, ownerId, draft: technique(a, 'Infinity', '3') }),
      ).toBe(true);
      expect(
        await upsertEntity(db, { systemSlug: slug, ownerId, draft: technique(b, 'Cleave', '5') }),
      ).toBe(true);

      const forA = await entitiesForCharacter(db, a);
      const forB = await entitiesForCharacter(db, b);

      // Each keeps its own, and neither sees the other's.
      expect(forA.filter((e) => e.key === 'signature-technique').map((e) => e.name)).toEqual([
        'Infinity',
      ]);
      expect(forB.filter((e) => e.key === 'signature-technique').map((e) => e.name)).toEqual([
        'Cleave',
      ]);

      await deleteCharacter(db, a, ownerId);
      await deleteCharacter(db, b, ownerId);
    });
  });
});
