'use server';

import type { CharacterBuild } from '@ttrpg/rules-engine';
import { createCharacter, deleteCharacter, getDatabase, updateCharacterBuild } from '@ttrpg/db';
import { characterBuild } from '@ttrpg/schemas';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { auth } from './auth';

async function requireUserId(): Promise<string> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) redirect('/');
  return id;
}

const ABILITY_KEYS = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;

/** Clamps to the range a point-buy or rolled score can occupy. */
const readScore = (form: FormData, key: string): number => {
  const raw = Number(form.get(`attr.${key}`) ?? 10);
  if (!Number.isFinite(raw)) return 10;
  return Math.min(30, Math.max(1, Math.round(raw)));
};

const readOptional = (form: FormData, key: string): string | undefined => {
  const value = form.get(key);
  return typeof value === 'string' && value.length > 0 ? value : undefined;
};

export async function createCharacterAction(form: FormData): Promise<void> {
  const ownerId = await requireUserId();

  const systemSlug = String(form.get('system') ?? '');
  const name = String(form.get('name') ?? '').trim();
  if (!name || !systemSlug) redirect('/characters/new?error=missing');

  const species = readOptional(form, 'species');
  const background = readOptional(form, 'background');
  const classKey = readOptional(form, 'class');
  const subclass = readOptional(form, 'subclass');

  const level = Math.min(20, Math.max(1, Number(form.get('level') ?? 1) || 1));

  const build: CharacterBuild = {
    attributes: Object.fromEntries(ABILITY_KEYS.map((key) => [key, readScore(form, key)])),
    taken: [species, background].filter((v): v is string => Boolean(v)),
    classes: classKey ? [{ key: classKey, ...(subclass ? { subclass } : {}), level }] : [],
    inventory: [],
  };

  const id = await createCharacter(getDatabase(), { ownerId, systemSlug, name, build });
  revalidatePath('/characters');
  redirect(`/characters/${id}`);
}

/** Equip, unequip, attune, or drop an item, and toggle transient states. */
export async function updateBuildAction(form: FormData): Promise<void> {
  const ownerId = await requireUserId();
  const id = String(form.get('id') ?? '');

  // The build arrives as JSON from a form field, so it is untrusted input even
  // though the character is the user's own. Validating here keeps shapes the
  // engine cannot resolve out of the database, where they would surface later
  // as a broken sheet rather than a rejected request.
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(form.get('build') ?? '{}'));
  } catch {
    redirect(`/characters/${id}?error=malformed`);
  }

  const result = characterBuild.safeParse(parsed);
  if (!result.success) redirect(`/characters/${id}?error=invalid`);

  const ok = await updateCharacterBuild(getDatabase(), id, ownerId, result.data as CharacterBuild);
  if (!ok) redirect('/characters');

  revalidatePath(`/characters/${id}`);
}

export async function deleteCharacterAction(form: FormData): Promise<void> {
  const ownerId = await requireUserId();
  await deleteCharacter(getDatabase(), String(form.get('id') ?? ''), ownerId);
  revalidatePath('/characters');
  redirect('/characters');
}
