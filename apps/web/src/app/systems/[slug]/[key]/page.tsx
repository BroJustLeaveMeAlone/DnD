import { getDatabase, getEntity, listOwnedSystems } from '@ttrpg/db';
import { type AuthoredEntity, authoredEntity } from '@ttrpg/schemas';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { EffectBuilder } from '@/components/effect-builder';
import { auth } from '@/server/auth';
import { saveEntityAction } from '@/server/authoring';

export const dynamic = 'force-dynamic';

export default async function EditEntityPage({
  params,
}: {
  params: Promise<{ slug: string; key: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/');

  const { slug, key } = await params;
  const db = getDatabase();

  const owned = await listOwnedSystems(db, session.user.id);
  if (!owned.some((s) => s.slug === slug)) notFound();

  const entity = await getEntity(db, slug, key);
  if (!entity) notFound();

  // Stored content came from a trusted seed or a previously validated save, but
  // parse it anyway: a schema change between then and now would otherwise hand
  // the editor a shape it cannot render, and a blank form silently discards the
  // entity on save.
  const parsed = authoredEntity.safeParse({
    key: entity.key,
    type: entity.type,
    name: entity.name,
    data: entity.data,
    grants: entity.grants,
  });

  const initial: AuthoredEntity = parsed.success
    ? parsed.data
    : { key: entity.key, type: 'feat', name: entity.name, data: {}, grants: [] };

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <nav className="mb-6 text-sm">
        <Link
          href={`/systems/${slug}`}
          className="text-neutral-500 underline-offset-4 hover:underline"
        >
          ← {slug}
        </Link>
      </nav>

      <h1 className="mb-2 text-3xl font-semibold tracking-tight">{entity.name}</h1>

      {!parsed.success && (
        <p
          role="alert"
          className="mb-6 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950"
        >
          This entity&rsquo;s stored mechanics could not be loaded into the editor, so the effects
          below start empty. Saving will replace what is stored.
        </p>
      )}

      <EffectBuilder systemSlug={slug} initial={initial} action={saveEntityAction} />
    </main>
  );
}
