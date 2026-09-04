import { getDatabase, listOwnedSystems } from '@ttrpg/db';
import type { AuthoredEntity } from '@ttrpg/schemas';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { EffectBuilder } from '@/components/effect-builder';
import { auth } from '@/server/auth';
import { saveEntityAction } from '@/server/authoring';

export const dynamic = 'force-dynamic';

const BLANK: AuthoredEntity = {
  key: '',
  type: 'feat',
  name: '',
  data: {},
  grants: [],
};

export default async function NewEntityPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect('/');

  const { slug } = await params;
  const owned = await listOwnedSystems(getDatabase(), session.user.id);
  if (!owned.some((s) => s.slug === slug)) notFound();

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

      <h1 className="mb-2 text-3xl font-semibold tracking-tight">New content</h1>
      <p className="mb-8 text-sm text-neutral-600 dark:text-neutral-400">
        Effects here drive real sheet math — the same machinery the bundled rulesets use. Formulas
        are checked against the actual parser as you type.
      </p>

      <EffectBuilder systemSlug={slug} initial={BLANK} action={saveEntityAction} />
    </main>
  );
}
