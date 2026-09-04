import { getDatabase, listCampaignsFor, listSystems } from '@ttrpg/db';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/server/auth';
import { createCampaignAction, joinCampaignAction } from '@/server/campaigns';

export const dynamic = 'force-dynamic';

const field =
  'w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-400 dark:border-neutral-700 dark:bg-neutral-900';

const button =
  'rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300';

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/');

  const db = getDatabase();
  const [campaigns, systems] = await Promise.all([
    listCampaignsFor(db, session.user.id),
    listSystems(db),
  ]);
  const { error } = await searchParams;

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">Campaigns</h1>
      <p className="mb-8 mt-2 text-sm text-neutral-600 dark:text-neutral-400">
        A table you run or play at. The GM sets house rules that change the maths for everyone.
      </p>

      {error && (
        <p
          role="alert"
          className="mb-6 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
        >
          {error === 'bad-invite' ? 'That invite link is not valid any more.' : `Error: ${error}`}
        </p>
      )}

      {campaigns.length === 0 ? (
        <p className="rounded-md border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500 dark:border-neutral-700">
          You are not at any table yet.
        </p>
      ) : (
        <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
          {campaigns.map((campaign) => (
            <li key={campaign.id}>
              <Link
                href={`/campaigns/${campaign.id}`}
                className="-mx-2 block rounded px-2 py-3 hover:bg-neutral-50 dark:hover:bg-neutral-900"
              >
                <div className="flex items-baseline justify-between gap-4">
                  <span className="font-medium">{campaign.name}</span>
                  <span className="text-xs uppercase text-neutral-500">{campaign.role}</span>
                </div>
                <p className="mt-0.5 text-xs text-neutral-500">{campaign.systemName}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <section className="mt-10 grid gap-6 sm:grid-cols-2">
        <form
          action={createCampaignAction}
          className="space-y-3 rounded-md border border-neutral-200 p-4 dark:border-neutral-800"
        >
          <h2 className="text-sm font-medium">Start a campaign</h2>
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-neutral-500">Name</span>
            <input name="name" required maxLength={200} className={field} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-neutral-500">Ruleset</span>
            <select name="system" className={field}>
              {systems.map((system) => (
                <option key={system.slug} value={system.slug}>
                  {system.name}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className={button}>
            Create
          </button>
        </form>

        <form
          action={joinCampaignAction}
          className="space-y-3 rounded-md border border-neutral-200 p-4 dark:border-neutral-800"
        >
          <h2 className="text-sm font-medium">Join with an invite</h2>
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-neutral-500">Invite code</span>
            <input name="token" required className={`${field} font-mono`} />
          </label>
          <button type="submit" className={button}>
            Join
          </button>
        </form>
      </section>
    </main>
  );
}
