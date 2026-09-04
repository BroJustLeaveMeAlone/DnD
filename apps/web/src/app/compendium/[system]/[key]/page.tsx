import { findByEffect, getDatabase, getEntity } from '@ttrpg/db';
import Link from 'next/link';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

interface JsonEffect {
  kind?: string;
  target?: string;
  operation?: string;
  value?: string;
  bonusType?: string;
  level?: string;
  bias?: string;
  response?: string;
  max?: string;
  recharge?: string;
  category?: string;
}

interface JsonGrant {
  effects?: JsonEffect[];
  atLevel?: number;
  detail?: string;
  when?: { kind?: string; flag?: string; formula?: string };
}

/** Renders an effect as something a person can read, not raw JSON. */
function describeEffect(effect: JsonEffect): string {
  switch (effect.kind) {
    case 'numeric': {
      const typed = effect.bonusType ? ` (${effect.bonusType} bonus)` : '';
      // Each operation reads differently in English; a shared "<verb> X by Y"
      // template produces "sets ac by 16", which is not what it means.
      switch (effect.operation) {
        case 'set':
          return `sets ${effect.target} to ${effect.value}${typed}`;
        case 'floor':
          return `raises ${effect.target} to at least ${effect.value}${typed}`;
        case 'cap':
          return `caps ${effect.target} at ${effect.value}${typed}`;
        default:
          return `modifies ${effect.target} by ${effect.value}${typed}`;
      }
    }
    case 'proficiency':
      return `grants ${effect.level} in ${effect.target}`;
    case 'roll-bias':
      return `grants ${effect.bias} on ${effect.target}`;
    case 'damage-response':
      return `grants ${effect.response} to ${effect.target}`;
    case 'resource':
      return `grants ${effect.target}, max ${effect.max}, recharges on ${effect.recharge}`;
    case 'grant':
      return `grants ${effect.category}: ${effect.target}`;
    default:
      return JSON.stringify(effect);
  }
}

function describeCondition(when: JsonGrant['when']): string | undefined {
  if (!when || when.kind === 'always') return undefined;
  if (when.kind === 'flag') return `while ${when.flag?.replace(/[-_.]/g, ' ')}`;
  if (when.kind === 'expression') return `when ${when.formula}`;
  if (when.kind === 'not') return 'conditionally';
  return 'conditionally';
}

export default async function EntityPage({
  params,
}: {
  params: Promise<{ system: string; key: string }>;
}) {
  const { system, key } = await params;
  const db = getDatabase();
  const entity = await getEntity(db, system, key);
  if (!entity) notFound();

  const grants = entity.grants as JsonGrant[];

  // Back-references: what else in this ruleset touches the same stats? This is
  // only possible because content is structured data rather than licensed prose.
  const primaryTarget = grants
    .flatMap((g) => g.effects ?? [])
    .find((e) => e.kind === 'numeric')?.target;

  const related = primaryTarget
    ? (await findByEffect(db, { systemSlug: system, target: primaryTarget })).filter(
        (e) => e.key !== entity.key,
      )
    : [];

  const data = Object.entries(entity.data).filter(([, v]) => v !== null && v !== undefined);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <nav className="mb-6 text-sm">
        <Link
          href={`/compendium?system=${entity.systemSlug}`}
          className="text-neutral-500 underline-offset-4 hover:underline"
        >
          ← {entity.systemName}
        </Link>
      </nav>

      <header className="border-b border-neutral-200 pb-6 dark:border-neutral-800">
        <p className="text-xs font-medium uppercase tracking-widest text-neutral-500">
          {entity.type.replace(/[-_]/g, ' ')}
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{entity.name}</h1>
        <p className="mt-2 text-sm text-neutral-500">
          {entity.source.name}
          {entity.source.license ? ` · ${entity.source.license}` : ''}
        </p>
      </header>

      {data.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-medium">Details</h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            {data.map(([field, value]) => (
              <div key={field} className="contents">
                <dt className="capitalize text-neutral-500">{field.replace(/([A-Z])/g, ' $1')}</dt>
                <dd className="font-mono">
                  {Array.isArray(value) ? value.join(', ') : String(value)}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {grants.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-medium">Mechanics</h2>
          <ul className="space-y-3 text-sm">
            {grants.map((grant, gi) => (
              <li
                key={gi}
                className="rounded-md border border-neutral-200 p-3 dark:border-neutral-800"
              >
                {(grant.atLevel || grant.when || grant.detail) && (
                  <p className="mb-2 text-xs text-neutral-500">
                    {[
                      grant.atLevel ? `from level ${grant.atLevel}` : undefined,
                      describeCondition(grant.when),
                      grant.detail,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                )}
                <ul className="space-y-1">
                  {(grant.effects ?? []).map((effect, ei) => (
                    <li key={ei} className="font-mono text-xs">
                      {describeEffect(effect)}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      )}

      {related.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-1 text-sm font-medium">
            Also affects <span className="font-mono">{primaryTarget}</span>
          </h2>
          <p className="mb-3 text-xs text-neutral-500">
            Found by querying effects structurally, not by matching text.
          </p>
          <ul className="flex flex-wrap gap-2">
            {related.map((other) => (
              <li key={other.id}>
                <Link
                  href={`/compendium/${other.systemSlug}/${other.key}`}
                  className="inline-block rounded-full border border-neutral-300 px-3 py-1 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
                >
                  {other.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
