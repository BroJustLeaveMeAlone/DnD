import { getDatabase, getOwnedSystem } from '@ttrpg/db';
import { type DialSettings, type SystemDefinition, systemDefinition } from '@ttrpg/schemas';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { SystemDesigner } from '@/components/system-designer';
import { auth } from '@/server/auth';
import { saveDesignAction } from '@/server/authoring';

export const dynamic = 'force-dynamic';

export default async function DesignPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/');

  const { slug } = await params;
  const { error } = await searchParams;

  const system = await getOwnedSystem(getDatabase(), slug, session.user.id);
  if (!system) notFound();

  const parsed = systemDefinition.safeParse(system.definition ?? {});
  const definition: SystemDefinition = parsed.success
    ? parsed.data
    : { attributes: [], derived: [] };

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <nav className="mb-6 text-sm">
        <Link
          href={`/systems/${slug}`}
          className="text-neutral-500 underline-offset-4 hover:underline"
        >
          ← {system.name}
        </Link>
      </nav>

      <h1 className="text-3xl font-semibold tracking-tight">Design</h1>
      <p className="mb-8 mt-2 text-sm text-neutral-600 dark:text-neutral-400">
        What this system <em>is</em>, before any content exists in it. Removing an attribute breaks
        every formula that referenced it — the sheet degrades and reports a diagnostic rather than
        crashing, but check the warnings afterwards.
      </p>

      {error && (
        <p
          role="alert"
          className="mb-6 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
        >
          Could not save: {error}
        </p>
      )}

      <SystemDesigner
        systemSlug={slug}
        hasParent={system.forkedFromId !== null}
        initialDefinition={definition}
        initialDials={(system.dials ?? {}) as DialSettings}
        action={saveDesignAction}
      />
    </main>
  );
}
