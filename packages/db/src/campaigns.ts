import { randomBytes } from 'node:crypto';
import { and, asc, eq, or } from 'drizzle-orm';
import type { Database } from './client.js';
import { campaignMembers, campaigns, characters, systems, users } from './schema/index.js';

/**
 * Campaigns, membership, and the house rules a table plays under.
 *
 * Every read is scoped by membership rather than by ownership: a player is not
 * the owner of the campaign but must still see the party. Authorisation lives
 * in the WHERE clause, never in a prior read that a concurrent write could
 * invalidate.
 */

export type CampaignRole = 'gm' | 'player' | 'spectator';

export interface CampaignSummary {
  id: string;
  name: string;
  ownerId: string;
  systemSlug: string;
  systemName: string;
  role: CampaignRole;
}

export async function createCampaign(
  db: Database,
  input: { ownerId: string; systemSlug: string; name: string },
): Promise<string> {
  const [system] = await db
    .select({ id: systems.id })
    .from(systems)
    .where(eq(systems.slug, input.systemSlug))
    .limit(1);

  if (!system) throw new Error(`Unknown system \`${input.systemSlug}\``);

  const [created] = await db
    .insert(campaigns)
    .values({ ownerId: input.ownerId, systemId: system.id, name: input.name })
    .returning({ id: campaigns.id });

  if (!created) throw new Error('failed to create campaign');

  // The creator is the GM. Without this they would own a campaign they are not
  // a member of, and every membership-scoped read would exclude them.
  await db
    .insert(campaignMembers)
    .values({ campaignId: created.id, userId: input.ownerId, role: 'gm' });

  return created.id;
}

export async function listCampaignsFor(db: Database, userId: string): Promise<CampaignSummary[]> {
  return db
    .select({
      id: campaigns.id,
      name: campaigns.name,
      ownerId: campaigns.ownerId,
      systemSlug: systems.slug,
      systemName: systems.name,
      role: campaignMembers.role,
    })
    .from(campaignMembers)
    .innerJoin(campaigns, eq(campaignMembers.campaignId, campaigns.id))
    .innerJoin(systems, eq(campaigns.systemId, systems.id))
    .where(eq(campaignMembers.userId, userId))
    .orderBy(asc(campaigns.name));
}

export async function roleIn(
  db: Database,
  campaignId: string,
  userId: string,
): Promise<CampaignRole | undefined> {
  const [row] = await db
    .select({ role: campaignMembers.role })
    .from(campaignMembers)
    .where(and(eq(campaignMembers.campaignId, campaignId), eq(campaignMembers.userId, userId)))
    .limit(1);
  return row?.role;
}

export interface PartyMember {
  userId: string;
  name: string | null;
  handle: string | null;
  role: CampaignRole;
  characterId: string | null;
  characterName: string | null;
  build: unknown;
}

export interface CampaignDetail {
  id: string;
  name: string;
  ownerId: string;
  systemSlug: string;
  systemName: string;
  inviteToken: string | null;
  houseRules: unknown[];
  members: PartyMember[];
}

export async function getCampaign(
  db: Database,
  campaignId: string,
  viewerId: string,
): Promise<CampaignDetail | undefined> {
  const role = await roleIn(db, campaignId, viewerId);
  if (!role) return undefined;

  const [campaign] = await db
    .select({
      id: campaigns.id,
      name: campaigns.name,
      ownerId: campaigns.ownerId,
      houseRules: campaigns.houseRules,
      inviteToken: campaigns.inviteToken,
      systemSlug: systems.slug,
      systemName: systems.name,
    })
    .from(campaigns)
    .innerJoin(systems, eq(campaigns.systemId, systems.id))
    .where(eq(campaigns.id, campaignId))
    .limit(1);

  if (!campaign) return undefined;

  const members = await db
    .select({
      userId: campaignMembers.userId,
      name: users.name,
      handle: users.handle,
      role: campaignMembers.role,
      characterId: campaignMembers.characterId,
      characterName: characters.name,
      build: characters.build,
    })
    .from(campaignMembers)
    .innerJoin(users, eq(campaignMembers.userId, users.id))
    .leftJoin(characters, eq(campaignMembers.characterId, characters.id))
    .where(eq(campaignMembers.campaignId, campaignId))
    .orderBy(asc(campaignMembers.role), asc(users.name));

  return {
    ...campaign,
    houseRules: (campaign.houseRules as unknown[]) ?? [],
    // Only the GM needs the invite token; handing it to every player would let
    // any of them recruit into someone else's table.
    inviteToken: role === 'gm' ? campaign.inviteToken : null,
    members,
  };
}

/** Rotating the token invalidates every link previously handed out. */
export async function rotateInviteToken(
  db: Database,
  campaignId: string,
  gmId: string,
): Promise<string | undefined> {
  if ((await roleIn(db, campaignId, gmId)) !== 'gm') return undefined;

  const token = randomBytes(18).toString('base64url');
  await db.update(campaigns).set({ inviteToken: token }).where(eq(campaigns.id, campaignId));
  return token;
}

export async function joinByInvite(
  db: Database,
  token: string,
  userId: string,
): Promise<string | undefined> {
  const [campaign] = await db
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(eq(campaigns.inviteToken, token))
    .limit(1);

  if (!campaign) return undefined;

  // Idempotent: following the link twice must not fail or change an existing
  // role — re-joining should never silently demote a GM to player.
  await db
    .insert(campaignMembers)
    .values({ campaignId: campaign.id, userId, role: 'player' })
    .onConflictDoNothing({ target: [campaignMembers.campaignId, campaignMembers.userId] });

  return campaign.id;
}

export async function assignCharacter(
  db: Database,
  input: { campaignId: string; userId: string; characterId: string | null },
): Promise<boolean> {
  if (input.characterId) {
    // A character must belong to the person assigning it and to this
    // campaign's system, or the party dashboard would resolve it against the
    // wrong ruleset.
    const [character] = await db
      .select({ systemId: characters.systemId })
      .from(characters)
      .where(and(eq(characters.id, input.characterId), eq(characters.ownerId, input.userId)))
      .limit(1);

    if (!character) return false;

    const [campaign] = await db
      .select({ systemId: campaigns.systemId })
      .from(campaigns)
      .where(eq(campaigns.id, input.campaignId))
      .limit(1);

    if (!campaign || campaign.systemId !== character.systemId) return false;
  }

  const updated = await db
    .update(campaignMembers)
    .set({ characterId: input.characterId })
    .where(
      and(
        eq(campaignMembers.campaignId, input.campaignId),
        eq(campaignMembers.userId, input.userId),
      ),
    )
    .returning({ userId: campaignMembers.userId });

  return updated.length > 0;
}

export async function setHouseRules(
  db: Database,
  input: { campaignId: string; gmId: string; houseRules: unknown[] },
): Promise<boolean> {
  if ((await roleIn(db, input.campaignId, input.gmId)) !== 'gm') return false;

  await db
    .update(campaigns)
    .set({ houseRules: input.houseRules, updatedAt: new Date() })
    .where(eq(campaigns.id, input.campaignId));

  return true;
}

export async function setMemberRole(
  db: Database,
  input: { campaignId: string; gmId: string; userId: string; role: CampaignRole },
): Promise<boolean> {
  if ((await roleIn(db, input.campaignId, input.gmId)) !== 'gm') return false;

  // Refuse to remove the last GM. A campaign nobody can administer is
  // unrecoverable through the UI.
  if (input.role !== 'gm') {
    const gms = await db
      .select({ userId: campaignMembers.userId })
      .from(campaignMembers)
      .where(and(eq(campaignMembers.campaignId, input.campaignId), eq(campaignMembers.role, 'gm')));

    if (gms.length === 1 && gms[0]?.userId === input.userId) return false;
  }

  const updated = await db
    .update(campaignMembers)
    .set({ role: input.role })
    .where(
      and(
        eq(campaignMembers.campaignId, input.campaignId),
        eq(campaignMembers.userId, input.userId),
      ),
    )
    .returning({ userId: campaignMembers.userId });

  return updated.length > 0;
}

export async function removeMember(
  db: Database,
  input: { campaignId: string; actorId: string; userId: string },
): Promise<boolean> {
  const actorRole = await roleIn(db, input.campaignId, input.actorId);
  // A GM may remove anyone; anyone may remove themselves.
  if (actorRole !== 'gm' && input.actorId !== input.userId) return false;

  if (input.userId !== input.actorId || actorRole === 'gm') {
    const gms = await db
      .select({ userId: campaignMembers.userId })
      .from(campaignMembers)
      .where(and(eq(campaignMembers.campaignId, input.campaignId), eq(campaignMembers.role, 'gm')));

    if (gms.length === 1 && gms[0]?.userId === input.userId) return false;
  }

  const deleted = await db
    .delete(campaignMembers)
    .where(
      and(
        eq(campaignMembers.campaignId, input.campaignId),
        eq(campaignMembers.userId, input.userId),
      ),
    )
    .returning({ userId: campaignMembers.userId });

  return deleted.length > 0;
}

export async function deleteCampaign(
  db: Database,
  campaignId: string,
  ownerId: string,
): Promise<boolean> {
  const deleted = await db
    .delete(campaigns)
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.ownerId, ownerId)))
    .returning({ id: campaigns.id });

  return deleted.length > 0;
}

/** Characters the user could bring to this campaign — same system, theirs. */
export async function eligibleCharacters(db: Database, campaignId: string, userId: string) {
  const [campaign] = await db
    .select({ systemId: campaigns.systemId })
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .limit(1);

  if (!campaign) return [];

  return db
    .select({ id: characters.id, name: characters.name })
    .from(characters)
    .where(and(eq(characters.ownerId, userId), eq(characters.systemId, campaign.systemId)))
    .orderBy(asc(characters.name));
}

/** Used by the invite page to show what you are about to join. */
export async function campaignByInvite(db: Database, token: string) {
  const [row] = await db
    .select({ id: campaigns.id, name: campaigns.name, systemName: systems.name })
    .from(campaigns)
    .innerJoin(systems, eq(campaigns.systemId, systems.id))
    .where(eq(campaigns.inviteToken, token))
    .limit(1);
  return row;
}

/** Campaigns a character is committed to, so deleting one can warn first. */
export async function campaignsUsingCharacter(db: Database, characterId: string) {
  return db
    .select({ id: campaigns.id, name: campaigns.name })
    .from(campaignMembers)
    .innerJoin(campaigns, eq(campaignMembers.campaignId, campaigns.id))
    .where(or(eq(campaignMembers.characterId, characterId)));
}
