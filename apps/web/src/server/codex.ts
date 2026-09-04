'use server';

import { deleteCodexEntry, getDatabase, upsertCodexEntry } from '@ttrpg/db';
import { codexEntry } from '@ttrpg/schemas';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { auth } from './auth';

async function requireUserId(): Promise<string> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) redirect('/');
  return id;
}

export async function saveCodexEntryAction(form: FormData): Promise<void> {
  const ownerId = await requireUserId();
  const systemSlug = String(form.get('systemSlug') ?? '');
  const back = `/systems/${systemSlug}/codex`;

  const entityKey = String(form.get('entityKey') ?? '').trim();

  const parsed = codexEntry.safeParse({
    key: String(form.get('key') ?? '').trim(),
    type: String(form.get('type') ?? 'note'),
    title: String(form.get('title') ?? '').trim(),
    body: String(form.get('body') ?? ''),
    entityKey: entityKey === '' ? null : entityKey,
    visibility: String(form.get('visibility') ?? 'private'),
  });

  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const detail = first ? `${first.path.join('.')}: ${first.message}` : 'invalid';
    redirect(`${back}?error=${encodeURIComponent(detail)}`);
  }

  const ok = await upsertCodexEntry(getDatabase(), {
    systemSlug,
    ownerId,
    draft: parsed.data,
  });
  if (!ok) redirect('/systems?error=forbidden');

  revalidatePath(back);
  redirect(`${back}/${parsed.data.key}`);
}

export async function deleteCodexEntryAction(form: FormData): Promise<void> {
  const ownerId = await requireUserId();
  const systemSlug = String(form.get('systemSlug') ?? '');

  await deleteCodexEntry(getDatabase(), {
    systemSlug,
    ownerId,
    key: String(form.get('key') ?? ''),
  });

  revalidatePath(`/systems/${systemSlug}/codex`);
  redirect(`/systems/${systemSlug}/codex`);
}
