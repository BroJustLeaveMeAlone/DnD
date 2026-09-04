import { fileURLToPath } from 'node:url';
import { dnd5e2014 } from '@ttrpg/systems-dnd5e';
import { config } from 'dotenv';
import { beforeAll, describe, expect, it } from 'vitest';
import { forkSystem } from './authoring.js';
import {
  assignCharacter,
  campaignByInvite,
  createCampaign,
  deleteCampaign,
  eligibleCharacters,
  getCampaign,
  joinByInvite,
  listCampaignsFor,
  removeMember,
  roleIn,
  rotateInviteToken,
  setHouseRules,
  setMemberRole,
} from './campaigns.js';
import { createCharacter } from './characters.js';
import { type Database, createDatabase } from './client.js';
import { ensureSystemAccount, seedSystemModule } from './seed.js';
import { findOrCreateUser } from './sessions.js';

config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });

const connectionString = process.env.DATABASE_URL;
const describeDb = connectionString ? describe : describe.skip;
const unique = () => Math.random().toString(36).slice(2, 8);

const BUILD = {
  attributes: { str: 16, dex: 14, con: 15, int: 10, wis: 12, cha: 8 },
  taken: ['human'],
  classes: [{ key: 'fighter', level: 3 }],
};

describeDb('campaigns', () => {
  let db: Database;
  let gm: string;
  let player: string;
  let outsider: string;

  const user = (label: string) =>
    findOrCreateUser(db, {
      email: `${label}-${unique()}@test.local`,
      name: label,
      handle: `${label}-${unique()}`,
    });

  beforeAll(async () => {
    db = createDatabase(connectionString!);
    await seedSystemModule(db, dnd5e2014, await ensureSystemAccount(db));
    gm = await user('gm');
    player = await user('player');
    outsider = await user('outsider');
  }, 30_000);

  const newCampaign = async (name = 'Table') =>
    createCampaign(db, { ownerId: gm, systemSlug: 'dnd5e-2014', name });

  it('makes the creator a GM member, not merely the owner', async () => {
    // Otherwise they own a campaign they are not a member of, and every
    // membership-scoped read excludes them from their own table.
    const id = await newCampaign();
    expect(await roleIn(db, id, gm)).toBe('gm');
    expect((await listCampaignsFor(db, gm)).map((c) => c.id)).toContain(id);
  });

  it('rejects a campaign in a system that does not exist', async () => {
    await expect(
      createCampaign(db, { ownerId: gm, systemSlug: 'nope', name: 'Doomed' }),
    ).rejects.toThrow(/Unknown system/);
  });

  it('hides a campaign from non-members entirely', async () => {
    const id = await newCampaign();
    expect(await getCampaign(db, id, outsider)).toBeUndefined();
    expect(await roleIn(db, id, outsider)).toBeUndefined();
  });

  describe('invites', () => {
    it('lets someone join by token, once', async () => {
      const id = await newCampaign();
      const token = await rotateInviteToken(db, id, gm);
      expect(token).toBeDefined();

      expect(await joinByInvite(db, token!, player)).toBe(id);
      expect(await roleIn(db, id, player)).toBe('player');

      // Following the link twice must not fail or change the role.
      expect(await joinByInvite(db, token!, player)).toBe(id);
      expect(await roleIn(db, id, player)).toBe('player');
    });

    it('does not demote a GM who follows their own invite link', async () => {
      const id = await newCampaign();
      const token = await rotateInviteToken(db, id, gm);
      await joinByInvite(db, token!, gm);
      expect(await roleIn(db, id, gm)).toBe('gm');
    });

    it('rotating the token invalidates the previous link', async () => {
      const id = await newCampaign();
      const first = await rotateInviteToken(db, id, gm);
      await rotateInviteToken(db, id, gm);

      expect(await joinByInvite(db, first!, outsider)).toBeUndefined();
      expect(await roleIn(db, id, outsider)).toBeUndefined();
    });

    it('refuses to mint an invite for a non-GM', async () => {
      const id = await newCampaign();
      const token = await rotateInviteToken(db, id, gm);
      await joinByInvite(db, token!, player);

      expect(await rotateInviteToken(db, id, player)).toBeUndefined();
      expect(await rotateInviteToken(db, id, outsider)).toBeUndefined();
    });

    it('exposes the token only to the GM', async () => {
      const id = await newCampaign();
      const token = await rotateInviteToken(db, id, gm);
      await joinByInvite(db, token!, player);

      expect((await getCampaign(db, id, gm))?.inviteToken).toBe(token);
      // A player holding the token could recruit into someone else's table.
      expect((await getCampaign(db, id, player))?.inviteToken).toBeNull();
    });

    it('resolves an unknown token to nothing', async () => {
      expect(await campaignByInvite(db, 'not-a-real-token')).toBeUndefined();
      expect(await joinByInvite(db, 'not-a-real-token', player)).toBeUndefined();
    });
  });

  describe('characters', () => {
    it('assigns a character the member owns', async () => {
      const id = await newCampaign();
      const characterId = await createCharacter(db, {
        ownerId: gm,
        systemSlug: 'dnd5e-2014',
        name: 'Valda',
        build: BUILD,
      });

      expect(await assignCharacter(db, { campaignId: id, userId: gm, characterId })).toBe(true);
      const detail = await getCampaign(db, id, gm);
      expect(detail?.members[0]?.characterName).toBe('Valda');
    });

    it('refuses a character belonging to someone else', async () => {
      const id = await newCampaign();
      const token = await rotateInviteToken(db, id, gm);
      await joinByInvite(db, token!, player);

      const someoneElses = await createCharacter(db, {
        ownerId: gm,
        systemSlug: 'dnd5e-2014',
        name: 'Not Yours',
        build: BUILD,
      });

      expect(
        await assignCharacter(db, { campaignId: id, userId: player, characterId: someoneElses }),
      ).toBe(false);
    });

    it('refuses a character from a different ruleset', async () => {
      // The party dashboard resolves every sheet against the campaign's system.
      // A mismatched character would be computed under the wrong rules.
      const other = `other-${unique()}`;
      await forkSystem(db, { sourceSlug: 'dnd5e-2014', ownerId: gm, slug: other, name: 'Other' });

      const id = await newCampaign();
      const foreign = await createCharacter(db, {
        ownerId: gm,
        systemSlug: other,
        name: 'Foreign',
        build: BUILD,
      });

      expect(await assignCharacter(db, { campaignId: id, userId: gm, characterId: foreign })).toBe(
        false,
      );
    });

    it('lists only eligible characters', async () => {
      const id = await newCampaign();
      const mine = await createCharacter(db, {
        ownerId: gm,
        systemSlug: 'dnd5e-2014',
        name: `Eligible ${unique()}`,
        build: BUILD,
      });

      const eligible = await eligibleCharacters(db, id, gm);
      expect(eligible.map((c) => c.id)).toContain(mine);
      expect(await eligibleCharacters(db, id, outsider)).toEqual([]);
    });
  });

  describe('roles and house rules', () => {
    it('lets a GM set house rules and refuses everyone else', async () => {
      const id = await newCampaign();
      const token = await rotateInviteToken(db, id, gm);
      await joinByInvite(db, token!, player);

      const rules = [
        { effects: [{ kind: 'numeric', target: 'ac', operation: 'cap', value: '20' }] },
      ];
      expect(await setHouseRules(db, { campaignId: id, gmId: gm, houseRules: rules })).toBe(true);
      expect((await getCampaign(db, id, gm))?.houseRules).toEqual(rules);

      expect(await setHouseRules(db, { campaignId: id, gmId: player, houseRules: [] })).toBe(false);
      expect(await setHouseRules(db, { campaignId: id, gmId: outsider, houseRules: [] })).toBe(
        false,
      );
    });

    it('refuses to demote the last GM', async () => {
      // A campaign nobody can administer is unrecoverable through the UI.
      const id = await newCampaign();
      expect(
        await setMemberRole(db, { campaignId: id, gmId: gm, userId: gm, role: 'player' }),
      ).toBe(false);
      expect(await roleIn(db, id, gm)).toBe('gm');
    });

    it('refuses to remove the last GM', async () => {
      const id = await newCampaign();
      expect(await removeMember(db, { campaignId: id, actorId: gm, userId: gm })).toBe(false);
    });

    it('allows demotion once a second GM exists', async () => {
      const id = await newCampaign();
      const token = await rotateInviteToken(db, id, gm);
      await joinByInvite(db, token!, player);

      expect(
        await setMemberRole(db, { campaignId: id, gmId: gm, userId: player, role: 'gm' }),
      ).toBe(true);
      expect(
        await setMemberRole(db, { campaignId: id, gmId: player, userId: gm, role: 'player' }),
      ).toBe(true);
      expect(await roleIn(db, id, gm)).toBe('player');
    });

    it('lets a player remove themselves but not others', async () => {
      const id = await newCampaign();
      const token = await rotateInviteToken(db, id, gm);
      await joinByInvite(db, token!, player);
      await joinByInvite(db, token!, outsider);

      expect(await removeMember(db, { campaignId: id, actorId: player, userId: outsider })).toBe(
        false,
      );
      expect(await removeMember(db, { campaignId: id, actorId: player, userId: player })).toBe(
        true,
      );
      expect(await roleIn(db, id, player)).toBeUndefined();
    });
  });

  it('deletes only for the owner', async () => {
    const id = await newCampaign();
    expect(await deleteCampaign(db, id, player)).toBe(false);
    expect(await deleteCampaign(db, id, gm)).toBe(true);
    expect(await getCampaign(db, id, gm)).toBeUndefined();
  });
});
