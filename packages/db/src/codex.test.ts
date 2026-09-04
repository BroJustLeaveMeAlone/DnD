import { fileURLToPath } from 'node:url';
import { dnd5e2014 } from '@ttrpg/systems-dnd5e';
import { config } from 'dotenv';
import { beforeAll, describe, expect, it } from 'vitest';
import { forkSystem } from './authoring.js';
import { type Database, createDatabase } from './client.js';
import {
  danglingLinks,
  deleteCodexEntry,
  extractLinks,
  getCodexEntry,
  listCodexEntries,
  upsertCodexEntry,
} from './codex.js';
import { ensureSystemAccount, seedSystemModule } from './seed.js';
import { findOrCreateUser } from './sessions.js';

config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });

const connectionString = process.env.DATABASE_URL;
const describeDb = connectionString ? describe : describe.skip;
const unique = () => Math.random().toString(36).slice(2, 8);

describe('link extraction', () => {
  it('finds wiki links and de-duplicates them', () => {
    expect(extractLinks('The [[iron-court]] fell to the [[iron-court]] rebels.')).toEqual([
      'iron-court',
    ]);
  });

  it('tolerates whitespace inside the brackets', () => {
    expect(extractLinks('See [[ high-tower ]].')).toEqual(['high-tower']);
  });

  it('ignores malformed or non-slug links', () => {
    expect(extractLinks('[[Not A Slug]] [[]] [single] [[trailing-')).toEqual([]);
  });

  it('returns a stable order regardless of appearance order', () => {
    expect(extractLinks('[[zed]] [[alpha]]')).toEqual(extractLinks('[[alpha]] [[zed]]'));
  });
});

describeDb('codex', () => {
  let db: Database;
  let ownerId: string;
  let strangerId: string;
  let slug: string;

  beforeAll(async () => {
    db = createDatabase(connectionString!);
    await seedSystemModule(db, dnd5e2014, await ensureSystemAccount(db));

    ownerId = await findOrCreateUser(db, {
      email: 'loremaster@test.local',
      name: 'Loremaster',
      handle: `lore-${unique()}`,
    });
    strangerId = await findOrCreateUser(db, {
      email: 'tourist@test.local',
      name: 'Tourist',
      handle: `tourist-${unique()}`,
    });

    slug = `world-${unique()}`;
    await forkSystem(db, { sourceSlug: 'dnd5e-2014', ownerId, slug, name: 'World' });
  }, 30_000);

  it('creates and reads an entry', async () => {
    await upsertCodexEntry(db, {
      systemSlug: slug,
      ownerId,
      draft: {
        key: 'iron-court',
        type: 'faction',
        title: 'The Iron Court',
        body: 'Rulers of the northern reach.',
      },
    });

    const entry = await getCodexEntry(db, slug, 'iron-court');
    expect(entry?.title).toBe('The Iron Court');
    expect(entry?.type).toBe('faction');
  });

  it('refuses writes from a non-owner', async () => {
    expect(
      await upsertCodexEntry(db, {
        systemSlug: slug,
        ownerId: strangerId,
        draft: { key: 'intrusion', type: 'note', title: 'Intrusion', body: '' },
      }),
    ).toBe(false);
    expect(await getCodexEntry(db, slug, 'intrusion')).toBeUndefined();

    expect(
      await deleteCodexEntry(db, { systemSlug: slug, ownerId: strangerId, key: 'iron-court' }),
    ).toBe(false);
    expect(await getCodexEntry(db, slug, 'iron-court')).toBeDefined();
  });

  it('records backlinks in both directions', async () => {
    await upsertCodexEntry(db, {
      systemSlug: slug,
      ownerId,
      draft: {
        key: 'high-tower',
        type: 'location',
        title: 'High Tower',
        body: 'Seat of the [[iron-court]].',
      },
    });

    const tower = await getCodexEntry(db, slug, 'high-tower');
    expect(tower?.links).toEqual(['iron-court']);

    // The link is stored on the tower, but the court can see who points at it.
    const court = await getCodexEntry(db, slug, 'iron-court');
    expect(court?.backlinks.map((b) => b.key)).toContain('high-tower');
  });

  it('does not list an entry as its own backlink', async () => {
    await upsertCodexEntry(db, {
      systemSlug: slug,
      ownerId,
      draft: {
        key: 'ouroboros',
        type: 'note',
        title: 'Ouroboros',
        body: 'See [[ouroboros]].',
      },
    });
    const entry = await getCodexEntry(db, slug, 'ouroboros');
    expect(entry?.backlinks).toEqual([]);
  });

  it('updates links when the body changes', async () => {
    await upsertCodexEntry(db, {
      systemSlug: slug,
      ownerId,
      draft: { key: 'shifting', type: 'note', title: 'Shifting', body: 'To [[iron-court]].' },
    });
    expect((await getCodexEntry(db, slug, 'shifting'))?.links).toEqual(['iron-court']);

    await upsertCodexEntry(db, {
      systemSlug: slug,
      ownerId,
      draft: { key: 'shifting', type: 'note', title: 'Shifting', body: 'No links now.' },
    });
    expect((await getCodexEntry(db, slug, 'shifting'))?.links).toEqual([]);

    const court = await getCodexEntry(db, slug, 'iron-court');
    expect(court?.backlinks.map((b) => b.key)).not.toContain('shifting');
  });

  describe('mechanical binding — the point of the Codex', () => {
    it('resolves a bound content entity', async () => {
      await upsertCodexEntry(db, {
        systemSlug: slug,
        ownerId,
        draft: {
          key: 'blade-of-the-court',
          type: 'item',
          title: 'Blade of the Court',
          body: 'Forged for the [[iron-court]].',
          // Binds to real mechanics: this entry *is* the longsword.
          entityKey: 'longsword',
        },
      });

      const entry = await getCodexEntry(db, slug, 'blade-of-the-court');
      expect(entry?.boundEntity?.key).toBe('longsword');
      expect(entry?.boundEntity?.name).toBe('Longsword');
      expect(entry?.boundEntity?.type).toBe('item');
    });

    it('leaves the binding unresolved when the entity does not exist', async () => {
      // Deleting the entity later must not break the lore entry.
      await upsertCodexEntry(db, {
        systemSlug: slug,
        ownerId,
        draft: {
          key: 'lost-relic',
          type: 'item',
          title: 'Lost Relic',
          body: '',
          entityKey: 'never-existed',
        },
      });

      const entry = await getCodexEntry(db, slug, 'lost-relic');
      expect(entry?.entityKey).toBe('never-existed');
      expect(entry?.boundEntity).toBeUndefined();
    });
  });

  it('reports dangling links without treating them as errors', async () => {
    await upsertCodexEntry(db, {
      systemSlug: slug,
      ownerId,
      draft: {
        key: 'prophecy',
        type: 'note',
        title: 'Prophecy',
        body: 'The [[unwritten-heir]] shall return.',
      },
    });

    const dangling = await danglingLinks(db, slug);
    expect(dangling).toContainEqual({ from: 'prophecy', to: 'unwritten-heir' });
    // Existing targets must not appear.
    expect(dangling.some((d) => d.to === 'iron-court')).toBe(false);
  });

  it('scopes entries to their system', async () => {
    const other = `other-${unique()}`;
    await forkSystem(db, { sourceSlug: 'dnd5e-2014', ownerId, slug: other, name: 'Other' });

    expect(await getCodexEntry(db, other, 'iron-court')).toBeUndefined();
    expect(await listCodexEntries(db, other)).toEqual([]);
    expect((await listCodexEntries(db, slug)).length).toBeGreaterThan(0);
  });

  it('deletes an entry', async () => {
    await upsertCodexEntry(db, {
      systemSlug: slug,
      ownerId,
      draft: { key: 'doomed', type: 'note', title: 'Doomed', body: '' },
    });
    expect(await deleteCodexEntry(db, { systemSlug: slug, ownerId, key: 'doomed' })).toBe(true);
    expect(await getCodexEntry(db, slug, 'doomed')).toBeUndefined();
  });
});
