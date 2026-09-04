'use server';

import { deleteEntity, forkSystem, getDatabase, upsertEntity } from '@ttrpg/db';
import { Formula } from '@ttrpg/rules-engine';
import { authoredEntity, systemFork } from '@ttrpg/schemas';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { auth } from './auth';

async function requireUserId(): Promise<string> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) redirect('/');
  return id;
}

export interface FormulaCheck {
  ok: boolean;
  error?: string;
  references?: string[];
}

/**
 * Validates a formula without evaluating it.
 *
 * Parse errors carry a character position, which is what makes the editor able
 * to point at the mistake instead of just refusing the input.
 */
export async function checkFormula(source: string): Promise<FormulaCheck> {
  const result = Formula.tryParse(source);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true, references: [...result.formula.references].sort() };
}

export async function forkSystemAction(form: FormData): Promise<void> {
  const ownerId = await requireUserId();

  const parsed = systemFork.safeParse({
    sourceSlug: String(form.get('sourceSlug') ?? ''),
    slug: String(form.get('slug') ?? ''),
    name: String(form.get('name') ?? ''),
  });

  if (!parsed.success) redirect('/systems?error=invalid');

  try {
    await forkSystem(getDatabase(), { ...parsed.data, ownerId });
  } catch {
    // A duplicate slug is the realistic failure here, and it is the user's
    // problem to fix rather than an internal error.
    redirect('/systems?error=slug-taken');
  }

  revalidatePath('/systems');
  redirect(`/systems/${parsed.data.slug}`);
}

export async function saveEntityAction(form: FormData): Promise<void> {
  const ownerId = await requireUserId();
  const systemSlug = String(form.get('systemSlug') ?? '');

  let draft: unknown;
  try {
    draft = JSON.parse(String(form.get('entity') ?? '{}'));
  } catch {
    redirect(`/systems/${systemSlug}?error=malformed`);
  }

  const parsed = authoredEntity.safeParse(draft);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const detail = first ? `${first.path.join('.')}: ${first.message}` : 'invalid';
    redirect(`/systems/${systemSlug}?error=${encodeURIComponent(detail)}`);
  }

  // Every formula must parse before it reaches the database. The schema checks
  // shape; only the engine can tell whether the text is a valid expression.
  for (const grant of parsed.data.grants) {
    const sources = [
      ...grant.effects.flatMap((e) =>
        e.kind === 'numeric' ? [e.value] : e.kind === 'resource' ? [e.max] : [],
      ),
      ...(grant.when?.kind === 'expression' ? [grant.when.formula] : []),
    ];
    for (const source of sources) {
      if (!Formula.tryParse(source).ok) {
        redirect(`/systems/${systemSlug}?error=${encodeURIComponent(`bad formula: ${source}`)}`);
      }
    }
  }

  const characterId = form.get('characterId');
  const ok = await upsertEntity(getDatabase(), {
    systemSlug,
    ownerId,
    draft: {
      ...parsed.data,
      ...(typeof characterId === 'string' && characterId ? { characterId } : {}),
    },
  });

  if (!ok) redirect('/systems?error=forbidden');

  revalidatePath(`/systems/${systemSlug}`);
  redirect(`/systems/${systemSlug}`);
}

export async function deleteEntityAction(form: FormData): Promise<void> {
  const ownerId = await requireUserId();
  const systemSlug = String(form.get('systemSlug') ?? '');

  await deleteEntity(getDatabase(), {
    systemSlug,
    ownerId,
    key: String(form.get('key') ?? ''),
  });

  revalidatePath(`/systems/${systemSlug}`);
  redirect(`/systems/${systemSlug}`);
}
