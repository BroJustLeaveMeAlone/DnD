import { getDatabase, getOwnedSystem, loadSystemModule } from '@ttrpg/db';
import { type LintFinding, type LintSeverity, lintSystem } from '@ttrpg/rules-engine';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/server/auth';

export const dynamic = 'force-dynamic';

const TONE: Record<LintSeverity, string> = {
  error: 'border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950',
  warning: 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950',
  info: 'border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900',
};

function Finding({ finding, slug }: { finding: LintFinding; slug: string }) {
  return (
    <li className={`rounded-md border p-3 text-sm ${TONE[finding.severity]}`}>
      <p className="flex flex-wrap items-baseline gap-2">
        <span className="font-mono text-xs uppercase">{finding.severity}</span>
        <span className="font-mono text-xs text-neutral-500">{finding.code}</span>
      </p>
      <p className="mt-1">{finding.message}</p>
      {finding.entityKey && (
        <Link
          href={`/systems/${slug}/${finding.entityKey}`}
          className="mt-1 inline-block text-xs underline underline-offset-4"
        >
          Edit {finding.entityKey}
        </Link>
      )}
      {(finding.statKey || finding.attributeKey) && !finding.entityKey && (
        <Link
          href={`/systems/${slug}/design`}
          className="mt-1 inline-block text-xs underline underline-offset-4"
        >
          Edit {finding.statKey ?? finding.attributeKey} in the designer
        </Link>
      )}
    </li>
  );
}

export default async function LintPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect('/');

  const { slug } = await params;
  const db = getDatabase();

  const owned = await getOwnedSystem(db, slug, session.user.id);
  if (!owned) notFound();

  const module = await loadSystemModule(db, slug);
  if (!module) notFound();

  const report = lintSystem(module);
  const clean = report.counts.error === 0 && report.counts.warning === 0;

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <nav className="mb-6 text-sm">
        <Link
          href={`/systems/${slug}`}
          className="text-neutral-500 underline-offset-4 hover:underline"
        >
          ← {owned.name}
        </Link>
      </nav>

      <h1 className="text-3xl font-semibold tracking-tight">Check</h1>
      <p className="mb-8 mt-2 text-sm text-neutral-600 dark:text-neutral-400">
        Static analysis plus generated characters at every level. All of it deterministic — no
        guessing, no API key, and it runs offline.
      </p>

      <dl className="mb-8 flex gap-6 text-sm">
        {(['error', 'warning', 'info'] as const).map((severity) => (
          <div key={severity}>
            <dt className="text-xs uppercase text-neutral-500">{severity}</dt>
            <dd className="text-2xl font-semibold tabular-nums">{report.counts[severity]}</dd>
          </div>
        ))}
      </dl>

      {clean && (
        <p className="rounded-md border border-emerald-300 bg-emerald-50 p-4 text-sm dark:border-emerald-800 dark:bg-emerald-950">
          No errors or warnings. Every formula resolves, and a character of each class was built and
          checked at every level.
        </p>
      )}

      {report.findings.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-3 text-sm font-medium">System</h2>
          <ul className="space-y-2">
            {report.findings.map((finding, i) => (
              <Finding key={i} finding={finding} slug={slug} />
            ))}
          </ul>
        </section>
      )}

      {report.probes.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-1 text-sm font-medium">Probe characters</h2>
          <p className="mb-3 text-xs text-neutral-500">
            Problems that only appear once a character actually exists — a formula that divides by a
            stat which happens to be zero at level 14, for instance.
          </p>
          <ul className="space-y-4">
            {report.probes.map((probe, i) => (
              <li key={i}>
                <p className="mb-2 text-xs font-medium">
                  {probe.label}, level {probe.level}
                </p>
                <ul className="space-y-2">
                  {probe.findings.map((finding, j) => (
                    <Finding key={j} finding={finding} slug={slug} />
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
