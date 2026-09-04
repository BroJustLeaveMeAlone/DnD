import { fileURLToPath } from 'node:url';
import type { CharacterBuild } from '@ttrpg/rules-engine';
import { buildSheet, dnd5e2014, dnd5e2024 } from '@ttrpg/systems-dnd5e';
import { config } from 'dotenv';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createCharacter,
  deleteCharacter,
  getCharacter,
  listCharacters,
  loadSystemModule,
  updateCharacterBuild,
} from './characters.js';
import { type Database, createDatabase } from './client.js';
import { ensureSystemAccount, seedSystemModule } from './seed.js';

config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });

const connectionString = process.env.DATABASE_URL;
const describeDb = connectionString ? describe : describe.skip;

const fighter5 = (): CharacterBuild => ({
  attributes: { str: 16, dex: 14, con: 15, int: 10, wis: 12, cha: 8 },
  taken: ['human', 'soldier', 'style-defense'],
  classes: [{ key: 'fighter', subclass: 'fighter-champion', level: 5 }],
  inventory: [
    { key: 'chain-mail', equipped: true },
    { key: 'shield', equipped: true },
    { key: 'ring-of-protection', attuned: true },
  ],
});

describeDb('system loading and characters', () => {
  let db: Database;
  let ownerId: string;

  beforeAll(async () => {
    db = createDatabase(connectionString!);
    ownerId = await ensureSystemAccount(db);
    await seedSystemModule(db, dnd5e2014, ownerId);
    await seedSystemModule(db, dnd5e2024, ownerId);
  }, 30_000);

  /**
   * The load-bearing test of this phase. Characters resolve against database
   * content, so if serialisation loses anything — a formula, a predicate, a
   * level gate — sheets are silently wrong for every user with homebrew. The
   * TypeScript module is the oracle; the database must match it exactly.
   */
  describe('round-trip: DB-loaded module matches the TypeScript module', () => {
    it.each([
      ['dnd5e-2014', dnd5e2014],
      ['dnd5e-2024', dnd5e2024],
    ])('%s produces an identical sheet', async (slug, source) => {
      const loaded = await loadSystemModule(db, slug);
      expect(loaded).toBeDefined();

      const fromCode = buildSheet(source, fighter5());
      const fromDb = buildSheet(loaded!, fighter5());

      expect(fromDb.diagnostics).toEqual([]);
      expect(fromDb.stats).toEqual(fromCode.stats);
      expect(fromDb.proficiencies).toEqual(fromCode.proficiencies);
      expect(fromDb.resources).toEqual(fromCode.resources);
      expect(fromDb.grants).toEqual(fromCode.grants);
    });

    it('preserves conditional predicates through serialisation', async () => {
      const loaded = (await loadSystemModule(db, 'dnd5e-2014'))!;

      const armoured = buildSheet(loaded, fighter5());
      const unarmoured = buildSheet(loaded, { ...fighter5(), inventory: [] });

      // Defense fighting style is gated on wearing armour. If the predicate
      // were lost in serialisation both would be equal.
      expect(armoured.stats.ac!.value).toBe(20);
      expect(unarmoured.stats.ac!.value).toBe(12);
    });

    it('preserves level gates through serialisation', async () => {
      const loaded = (await loadSystemModule(db, 'dnd5e-2014'))!;
      const atFour = buildSheet(loaded, {
        ...fighter5(),
        classes: [{ key: 'fighter', subclass: 'fighter-champion', level: 4 }],
      });
      const atFive = buildSheet(loaded, fighter5());

      expect(atFour.stats.attacks!.value).toBe(1);
      expect(atFive.stats.attacks!.value).toBe(2);
    });

    it('returns undefined for an unknown system', async () => {
      expect(await loadSystemModule(db, 'no-such-system')).toBeUndefined();
    });
  });

  describe('character CRUD', () => {
    it('creates, reads, updates, and deletes', async () => {
      const id = await createCharacter(db, {
        ownerId,
        systemSlug: 'dnd5e-2014',
        name: 'Test Fighter',
        build: fighter5(),
      });

      const fetched = await getCharacter(db, id);
      expect(fetched?.name).toBe('Test Fighter');
      expect(fetched?.systemSlug).toBe('dnd5e-2014');
      expect(fetched?.build.classes?.[0]?.level).toBe(5);

      const levelled = { ...fighter5(), classes: [{ key: 'fighter', level: 11 }] };
      expect(await updateCharacterBuild(db, id, ownerId, levelled)).toBe(true);
      expect((await getCharacter(db, id))?.build.classes?.[0]?.level).toBe(11);

      expect(await deleteCharacter(db, id, ownerId)).toBe(true);
      expect(await getCharacter(db, id)).toBeUndefined();
    });

    it('refuses to update or delete a character owned by someone else', async () => {
      const id = await createCharacter(db, {
        ownerId,
        systemSlug: 'dnd5e-2014',
        name: 'Not Yours',
        build: fighter5(),
      });
      const stranger = '00000000-0000-4000-8000-0000000000ff';

      expect(await updateCharacterBuild(db, id, stranger, fighter5())).toBe(false);
      expect(await deleteCharacter(db, id, stranger)).toBe(false);
      // Still intact and still owned by the original owner.
      expect((await getCharacter(db, id))?.ownerId).toBe(ownerId);

      await deleteCharacter(db, id, ownerId);
    });

    it('rejects a character in a system that does not exist', async () => {
      await expect(
        createCharacter(db, {
          ownerId,
          systemSlug: 'nope',
          name: 'Orphan',
          build: fighter5(),
        }),
      ).rejects.toThrow(/Unknown system/);
    });

    it('lists only the owner’s characters', async () => {
      const id = await createCharacter(db, {
        ownerId,
        systemSlug: 'dnd5e-2024',
        name: 'Listed',
        build: fighter5(),
      });
      const mine = await listCharacters(db, ownerId);
      expect(mine.map((c) => c.name)).toContain('Listed');

      const theirs = await listCharacters(db, '00000000-0000-4000-8000-0000000000ff');
      expect(theirs).toEqual([]);

      await deleteCharacter(db, id, ownerId);
    });
  });
});
