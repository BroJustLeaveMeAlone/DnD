'use server';

import {
  assignCharacter,
  createCampaign,
  deleteCampaign,
  getDatabase,
  joinByInvite,
  notifyCampaign,
  removeMember,
  rotateInviteToken,
  setHouseRules,
  setMemberRole,
} from '@ttrpg/db';
import { Formula } from '@ttrpg/rules-engine';
import { authoredGrant } from '@ttrpg/schemas';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { auth } from './auth';

async function requireUserId(): Promise<string> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) redirect('/');
  return id;
}

export async function createCampaignAction(form: FormData): Promise<void> {
  const ownerId = await requireUserId();
  const name = String(form.get('name') ?? '').trim();
  const systemSlug = String(form.get('system') ?? '');

  if (!name || !systemSlug) redirect('/campaigns?error=missing');

  const id = await createCampaign(getDatabase(), { ownerId, systemSlug, name });
  revalidatePath('/campaigns');
  redirect(`/campaigns/${id}`);
}

export async function rotateInviteAction(form: FormData): Promise<void> {
  const userId = await requireUserId();
  const campaignId = String(form.get('campaignId') ?? '');

  await rotateInviteToken(getDatabase(), campaignId, userId);
  revalidatePath(`/campaigns/${campaignId}`);
  redirect(`/campaigns/${campaignId}`);
}

export async function joinCampaignAction(form: FormData): Promise<void> {
  const userId = await requireUserId();
  const token = String(form.get('token') ?? '');

  const campaignId = await joinByInvite(getDatabase(), token, userId);
  if (!campaignId) redirect('/campaigns?error=bad-invite');

  revalidatePath('/campaigns');
  redirect(`/campaigns/${campaignId}`);
}

export async function assignCharacterAction(form: FormData): Promise<void> {
  const userId = await requireUserId();
  const campaignId = String(form.get('campaignId') ?? '');
  const raw = String(form.get('characterId') ?? '');

  const db = getDatabase();
  await assignCharacter(db, {
    campaignId,
    userId,
    characterId: raw === '' ? null : raw,
  });

  // The party dashboard shows everyone's sheet, so one player swapping
  // characters changes the view for the whole table.
  await notifyCampaign(db, campaignId, 'campaign');

  revalidatePath(`/campaigns/${campaignId}`);
  redirect(`/campaigns/${campaignId}`);
}

export async function setRoleAction(form: FormData): Promise<void> {
  const gmId = await requireUserId();
  const campaignId = String(form.get('campaignId') ?? '');

  const role = z.enum(['gm', 'player', 'spectator']).safeParse(form.get('role'));
  if (!role.success) redirect(`/campaigns/${campaignId}?error=bad-role`);

  const db = getDatabase();
  const ok = await setMemberRole(db, {
    campaignId,
    gmId,
    userId: String(form.get('userId') ?? ''),
    role: role.data,
  });

  // The realistic failure is demoting the last GM, which would leave the
  // campaign unadministerable.
  if (!ok) redirect(`/campaigns/${campaignId}?error=last-gm`);

  // A role change alters what the affected member can see, so their open view
  // has to re-render rather than keep GM controls it no longer has.
  await notifyCampaign(db, campaignId, 'campaign');

  revalidatePath(`/campaigns/${campaignId}`);
  redirect(`/campaigns/${campaignId}`);
}

export async function removeMemberAction(form: FormData): Promise<void> {
  const actorId = await requireUserId();
  const campaignId = String(form.get('campaignId') ?? '');

  const db = getDatabase();
  const ok = await removeMember(db, {
    campaignId,
    actorId,
    userId: String(form.get('userId') ?? ''),
  });

  if (!ok) redirect(`/campaigns/${campaignId}?error=last-gm`);

  await notifyCampaign(db, campaignId, 'campaign');

  revalidatePath(`/campaigns/${campaignId}`);
  redirect(actorId === String(form.get('userId')) ? '/campaigns' : `/campaigns/${campaignId}`);
}

const houseRules = z.array(authoredGrant).max(50);

export async function setHouseRulesAction(form: FormData): Promise<void> {
  const gmId = await requireUserId();
  const campaignId = String(form.get('campaignId') ?? '');

  let payload: unknown;
  try {
    payload = JSON.parse(String(form.get('houseRules') ?? '[]'));
  } catch {
    redirect(`/campaigns/${campaignId}?error=malformed`);
  }

  const parsed = houseRules.safeParse(payload);
  if (!parsed.success) redirect(`/campaigns/${campaignId}?error=invalid`);

  // Same rule as content authoring: shape validation cannot tell whether the
  // text is a valid expression, so every formula is parsed before it is stored.
  for (const grant of parsed.data) {
    const sources = [
      ...grant.effects.flatMap((e) =>
        e.kind === 'numeric' ? [e.value] : e.kind === 'resource' ? [e.max] : [],
      ),
      ...(grant.when?.kind === 'expression' ? [grant.when.formula] : []),
    ];
    for (const source of sources) {
      if (!Formula.tryParse(source).ok) {
        redirect(`/campaigns/${campaignId}?error=${encodeURIComponent(`bad formula: ${source}`)}`);
      }
    }
  }

  const db = getDatabase();
  const ok = await setHouseRules(db, { campaignId, gmId, houseRules: parsed.data });
  if (!ok) redirect(`/campaigns/${campaignId}?error=forbidden`);

  // House rules recompute every sheet at the table, so this is the change most
  // worth pushing out immediately.
  await notifyCampaign(db, campaignId, 'campaign');

  revalidatePath(`/campaigns/${campaignId}`);
  redirect(`/campaigns/${campaignId}`);
}

export async function deleteCampaignAction(form: FormData): Promise<void> {
  const ownerId = await requireUserId();
  await deleteCampaign(getDatabase(), String(form.get('campaignId') ?? ''), ownerId);
  revalidatePath('/campaigns');
  redirect('/campaigns');
}
