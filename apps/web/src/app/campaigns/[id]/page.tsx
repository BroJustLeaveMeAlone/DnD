import {
  eligibleCharacters,
  getCampaign,
  getDatabase,
  listEncounters,
  loadSystemModule,
  roleIn,
} from '@ttrpg/db';
import {
  type BoundEffect,
  type CharacterBuild,
  type DerivedSheet,
  bind,
  compile,
  deserializeGrant,
  resolve,
} from '@ttrpg/rules-engine';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/server/auth';
import {
  assignCharacterAction,
  deleteCampaignAction,
  removeMemberAction,
  rotateInviteAction,
  setHouseRulesAction,
  setRoleAction,
} from '@/server/campaigns';
import { createEncounterAction } from '@/server/encounters';

export const dynamic = 'force-dynamic';

const DEFAULT_SCALE = { none: 0, half: 0.5, proficient: 1, expertise: 2 } as const;

/** Stats every party dashboard shows, when the system happens to have them. */
const GLANCE = [
  ['hp.max', 'HP'],
  ['ac', 'AC'],
  ['passive.perception', 'Passive'],
  ['speed', 'Speed'],
] as const;

export default async function CampaignPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/');

  const { id } = await params;
  const { error } = await searchParams;
  const db = getDatabase();

  const campaign = await getCampaign(db, id, session.user.id);
  if (!campaign) notFound();

  const role = await roleIn(db, id, session.user.id);
  const isGm = role === 'gm';

  const [module, mine, encounters] = await Promise.all([
    loadSystemModule(db, campaign.systemSlug),
    eligibleCharacters(db, id, session.user.id),
    listEncounters(db, id, session.user.id),
  ]);
  if (!module) notFound();

  const scale = module.proficiencyScale ?? DEFAULT_SCALE;

  /**
   * House rules are ordinary effects, bound to the campaign as their source, so
   * they appear in every provenance trace by name. A player asking why their AC
   * is capped gets "Campaign house rule" in the trace rather than a number that
   * silently disagrees with the book.
   */
  const houseRuleEffects: BoundEffect[] = campaign.houseRules.flatMap((raw) => {
    try {
      const grant = deserializeGrant(raw as Record<string, unknown>);
      return grant.effects.map((effect) =>
        bind(
          effect,
          {
            id: `campaign:${campaign.id}`,
            name: 'Campaign house rule',
            ...(grant.detail ? { detail: grant.detail } : {}),
          },
          grant.when,
        ),
      );
    } catch {
      // A malformed rule must not take the whole party dashboard down.
      return [];
    }
  });

  const sheetFor = (build: CharacterBuild): DerivedSheet => {
    const input = compile(module, build);
    const withRules = { ...input, effects: [...input.effects, ...houseRuleEffects] };
    const discovered = resolve({ ...withRules, proficiencyScale: scale });
    const stateFlags = discovered.grants.filter((g) => g.category === 'state').map((g) => g.target);
    return resolve({
      ...withRules,
      flags: [
        ...(input.flags ?? []),
        ...stateFlags,
        ...(stateFlags.some((s) => s.startsWith('armour.')) ? ['armour.any'] : []),
      ],
      proficiencyScale: scale,
    });
  };

  const party = campaign.members.map((member) => ({
    ...member,
    sheet: member.build ? sheetFor(member.build as CharacterBuild) : undefined,
  }));

  const withCharacters = party.filter((m) => m.sheet);
  const glance = GLANCE.filter(([key]) => withCharacters.some((m) => m.sheet?.stats[key]));

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <nav className="mb-6 text-sm">
        <Link href="/campaigns" className="text-neutral-500 underline-offset-4 hover:underline">
          ← Campaigns
        </Link>
      </nav>

      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-neutral-200 pb-6 dark:border-neutral-800">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{campaign.name}</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {campaign.systemName} · you are {role}
          </p>
        </div>
        {campaign.ownerId === session.user.id && (
          <form action={deleteCampaignAction}>
            <input type="hidden" name="campaignId" value={campaign.id} />
            <button
              type="submit"
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800"
            >
              Delete
            </button>
          </form>
        )}
      </header>

      {error && (
        <p
          role="alert"
          className="mt-6 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
        >
          {error === 'last-gm'
            ? 'A campaign must keep at least one GM.'
            : `Could not save: ${error}`}
        </p>
      )}

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-medium">Party</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-xs text-neutral-500 dark:border-neutral-800">
                <th className="py-2 pr-4 font-medium">Player</th>
                <th className="py-2 pr-4 font-medium">Character</th>
                {glance.map(([key, label]) => (
                  <th key={key} className="py-2 pr-4 text-right font-medium">
                    {label}
                  </th>
                ))}
                {isGm && <th className="py-2 font-medium">Role</th>}
              </tr>
            </thead>
            <tbody>
              {party.map((member) => (
                <tr
                  key={member.userId}
                  className="border-b border-neutral-100 dark:border-neutral-900"
                >
                  <td className="py-2 pr-4">
                    {member.name ?? member.handle ?? 'Unnamed'}
                    <span className="ml-2 text-[10px] uppercase text-neutral-400">
                      {member.role}
                    </span>
                  </td>
                  <td className="py-2 pr-4">
                    {member.characterId ? (
                      <Link
                        href={`/characters/${member.characterId}`}
                        className="underline-offset-4 hover:underline"
                      >
                        {member.characterName}
                      </Link>
                    ) : (
                      <span className="text-neutral-400">—</span>
                    )}
                  </td>
                  {glance.map(([key]) => (
                    <td key={key} className="py-2 pr-4 text-right font-mono tabular-nums">
                      {member.sheet?.stats[key]?.value ?? '—'}
                    </td>
                  ))}
                  {isGm && (
                    <td className="py-2">
                      <form action={setRoleAction} className="flex items-center gap-1">
                        <input type="hidden" name="campaignId" value={campaign.id} />
                        <input type="hidden" name="userId" value={member.userId} />
                        <select
                          name="role"
                          defaultValue={member.role}
                          className="rounded border border-neutral-300 px-1 py-0.5 text-xs dark:border-neutral-700 dark:bg-neutral-900"
                        >
                          <option value="gm">gm</option>
                          <option value="player">player</option>
                          <option value="spectator">spectator</option>
                        </select>
                        <button type="submit" className="text-xs underline underline-offset-4">
                          set
                        </button>
                      </form>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {withCharacters.length === 0 && (
          <p className="mt-3 text-xs text-neutral-500">
            Nobody has brought a character yet. Stats appear here once they do.
          </p>
        )}
      </section>

      <section className="mt-8 grid gap-6 sm:grid-cols-2">
        <form
          action={assignCharacterAction}
          className="space-y-3 rounded-md border border-neutral-200 p-4 dark:border-neutral-800"
        >
          <h2 className="text-sm font-medium">Your character</h2>
          <input type="hidden" name="campaignId" value={campaign.id} />
          <select
            name="characterId"
            defaultValue={
              campaign.members.find((m) => m.userId === session.user!.id)?.characterId ?? ''
            }
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          >
            <option value="">None</option>
            {mine.map((character) => (
              <option key={character.id} value={character.id}>
                {character.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-neutral-500">
            Only characters you own in {campaign.systemName} can be brought to this table.
          </p>
          <button
            type="submit"
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
          >
            Save
          </button>
        </form>

        <div className="space-y-3 rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
          <h2 className="text-sm font-medium">Leave</h2>
          <p className="text-xs text-neutral-500">
            Removes you from this table. Your character is untouched.
          </p>
          <form action={removeMemberAction}>
            <input type="hidden" name="campaignId" value={campaign.id} />
            <input type="hidden" name="userId" value={session.user.id} />
            <button
              type="submit"
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
            >
              Leave campaign
            </button>
          </form>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-medium">Encounters</h2>
        {encounters.length === 0 ? (
          <p className="text-xs text-neutral-500">None yet.</p>
        ) : (
          <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {encounters.map((encounter) => (
              <li key={encounter.id} className="py-2">
                <Link
                  href={`/encounters/${encounter.id}`}
                  className="text-sm underline-offset-4 hover:underline"
                >
                  {encounter.name}
                </Link>
              </li>
            ))}
          </ul>
        )}
        {isGm && (
          <form action={createEncounterAction} className="mt-3 flex gap-2">
            <input type="hidden" name="campaignId" value={campaign.id} />
            <input
              name="name"
              placeholder="Encounter name"
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
            />
            <button
              type="submit"
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
            >
              New encounter
            </button>
          </form>
        )}
      </section>

      {isGm && (
        <>
          <section className="mt-8 rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
            <h2 className="text-sm font-medium">Invite</h2>
            {campaign.inviteToken ? (
              <p className="mt-2 break-all font-mono text-xs">{campaign.inviteToken}</p>
            ) : (
              <p className="mt-2 text-xs text-neutral-500">No invite link yet.</p>
            )}
            <form action={rotateInviteAction} className="mt-3">
              <input type="hidden" name="campaignId" value={campaign.id} />
              <button
                type="submit"
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
              >
                {campaign.inviteToken ? 'Rotate invite' : 'Create invite'}
              </button>
            </form>
            <p className="mt-2 text-xs text-neutral-500">
              Rotating invalidates the previous link — the only way to un-invite someone who shared
              it.
            </p>
          </section>

          <section className="mt-8 rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
            <h2 className="text-sm font-medium">House rules</h2>
            <p className="mb-3 mt-1 text-xs text-neutral-500">
              Effects applied to every character at this table. They appear in the provenance trace
              as &ldquo;Campaign house rule&rdquo;, so nobody has to guess why a number changed.
            </p>
            <form action={setHouseRulesAction} className="space-y-3">
              <input type="hidden" name="campaignId" value={campaign.id} />
              <label className="block">
                <span className="sr-only">House rules JSON</span>
                <textarea
                  name="houseRules"
                  rows={8}
                  defaultValue={JSON.stringify(campaign.houseRules, null, 2)}
                  className="w-full rounded-md border border-neutral-300 px-3 py-2 font-mono text-xs dark:border-neutral-700 dark:bg-neutral-900"
                />
              </label>
              <button
                type="submit"
                className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
              >
                Save house rules
              </button>
            </form>
          </section>
        </>
      )}
    </main>
  );
}
