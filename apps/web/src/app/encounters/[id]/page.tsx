import { getDatabase, getEncounter, roleIn } from '@ttrpg/db';
import { activeCombatant } from '@ttrpg/rules-engine';
import { type Combatant, encounterState, initiativeOrder } from '@ttrpg/schemas';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { LiveUpdates } from '@/components/live-updates';
import { auth } from '@/server/auth';
import {
  addCombatantAction,
  conditionAction,
  damageAction,
  deathSaveAction,
  nextTurnAction,
  removeCombatantAction,
  rollAction,
  startEncounterAction,
  temporaryHitPointsAction,
} from '@/server/encounters';

export const dynamic = 'force-dynamic';

const field =
  'rounded-md border border-neutral-300 px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900';
const chip =
  'rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800';

const CONDITIONS = [
  'blinded',
  'charmed',
  'frightened',
  'grappled',
  'incapacitated',
  'paralyzed',
  'poisoned',
  'prone',
  'restrained',
  'stunned',
  'unconscious',
];

export default async function EncounterPage({
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

  const row = await getEncounter(db, id, session.user.id);
  if (!row) notFound();

  const isGm = (await roleIn(db, row.campaignId, session.user.id)) === 'gm';

  const parsed = encounterState.safeParse(row.state);
  const state = parsed.success
    ? parsed.data
    : { round: 0, turn: 0, started: false, combatants: [], log: [] };

  const ordered = initiativeOrder(state.combatants as Combatant[]);
  const active = activeCombatant({ ...state, combatants: state.combatants as never });

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <LiveUpdates campaignId={row.campaignId} />

      <nav className="mb-6 text-sm">
        <Link
          href={`/campaigns/${row.campaignId}`}
          className="text-neutral-500 underline-offset-4 hover:underline"
        >
          ← Campaign
        </Link>
      </nav>

      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-neutral-200 pb-6 dark:border-neutral-800">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{row.name}</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {state.started ? `Round ${state.round} · ${active?.name ?? '—'}` : 'Not started'}
          </p>
        </div>
        {isGm && (
          <div className="flex gap-2">
            {!state.started ? (
              <form action={startEncounterAction}>
                <input type="hidden" name="encounterId" value={row.id} />
                <button
                  type="submit"
                  className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
                >
                  Start combat
                </button>
              </form>
            ) : (
              <form action={nextTurnAction}>
                <input type="hidden" name="encounterId" value={row.id} />
                <button
                  type="submit"
                  className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
                >
                  Next turn
                </button>
              </form>
            )}
          </div>
        )}
      </header>

      {(error || !parsed.success) && (
        <p
          role="alert"
          className="mt-6 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
        >
          {!parsed.success
            ? 'This encounter’s stored state could not be read. Nothing has been changed.'
            : `Error: ${error}`}
        </p>
      )}

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-medium">Initiative</h2>
        {ordered.length === 0 ? (
          <p className="rounded-md border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500 dark:border-neutral-700">
            No combatants yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {ordered.map((combatant) => {
              const isActive = active?.id === combatant.id;
              const down = combatant.hp.current <= 0;
              return (
                <li
                  key={combatant.id}
                  className={`rounded-md border p-3 ${
                    isActive
                      ? 'border-neutral-900 dark:border-neutral-100'
                      : 'border-neutral-200 dark:border-neutral-800'
                  } ${down ? 'opacity-60' : ''}`}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <span className="flex items-baseline gap-2">
                      <span className="w-6 text-right font-mono text-sm tabular-nums text-neutral-500">
                        {combatant.initiative}
                      </span>
                      <span className="font-medium">{combatant.name}</span>
                      <span className="text-[10px] uppercase text-neutral-400">
                        {combatant.side}
                      </span>
                      {combatant.concentratingOn && (
                        <span className="rounded-full border border-neutral-300 px-2 text-[10px] dark:border-neutral-700">
                          concentrating
                        </span>
                      )}
                    </span>
                    <span className="font-mono text-sm tabular-nums">
                      {combatant.hp.current}/{combatant.hp.max}
                      {combatant.hp.temporary > 0 && (
                        <span className="text-emerald-600 dark:text-emerald-400">
                          {' '}
                          +{combatant.hp.temporary}
                        </span>
                      )}
                      <span className="ml-3 text-neutral-500">AC {combatant.ac}</span>
                    </span>
                  </div>

                  {combatant.conditions.length > 0 && (
                    <ul className="mt-2 flex flex-wrap gap-1">
                      {combatant.conditions.map((condition) => (
                        <li key={condition.key}>
                          <form action={conditionAction} className="inline">
                            <input type="hidden" name="encounterId" value={row.id} />
                            <input type="hidden" name="combatantId" value={combatant.id} />
                            <input type="hidden" name="condition" value={condition.key} />
                            <input type="hidden" name="remove" value="true" />
                            <button
                              type="submit"
                              disabled={!isGm}
                              className="rounded-full border border-neutral-300 px-2 py-0.5 text-[10px] hover:line-through disabled:hover:no-underline dark:border-neutral-700"
                            >
                              {condition.key}
                              {condition.rounds !== null ? ` (${condition.rounds})` : ''}
                            </button>
                          </form>
                        </li>
                      ))}
                    </ul>
                  )}

                  {isGm && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <form action={damageAction} className="flex items-center gap-1">
                        <input type="hidden" name="encounterId" value={row.id} />
                        <input type="hidden" name="combatantId" value={combatant.id} />
                        <input
                          name="amount"
                          placeholder="7 or 2d6+3"
                          aria-label={`Amount for ${combatant.name}`}
                          className={`${field} w-28`}
                        />
                        <button type="submit" name="heal" value="false" className={chip}>
                          Damage
                        </button>
                        <button type="submit" name="heal" value="true" className={chip}>
                          Heal
                        </button>
                      </form>

                      <form action={temporaryHitPointsAction} className="flex items-center gap-1">
                        <input type="hidden" name="encounterId" value={row.id} />
                        <input type="hidden" name="combatantId" value={combatant.id} />
                        <input
                          name="amount"
                          type="number"
                          min={0}
                          placeholder="temp"
                          aria-label={`Temporary hit points for ${combatant.name}`}
                          className={`${field} w-20`}
                        />
                        <button type="submit" className={chip}>
                          Temp HP
                        </button>
                      </form>

                      <form action={conditionAction} className="flex items-center gap-1">
                        <input type="hidden" name="encounterId" value={row.id} />
                        <input type="hidden" name="combatantId" value={combatant.id} />
                        <select
                          name="condition"
                          aria-label={`Condition for ${combatant.name}`}
                          className={field}
                        >
                          {CONDITIONS.map((condition) => (
                            <option key={condition} value={condition}>
                              {condition}
                            </option>
                          ))}
                        </select>
                        <input
                          name="rounds"
                          type="number"
                          min={1}
                          placeholder="rds"
                          aria-label="Rounds"
                          className={`${field} w-16`}
                        />
                        <button type="submit" className={chip}>
                          Apply
                        </button>
                      </form>

                      {down && (
                        <form action={deathSaveAction} className="flex items-center gap-1">
                          <input type="hidden" name="encounterId" value={row.id} />
                          <input type="hidden" name="combatantId" value={combatant.id} />
                          <span className="font-mono text-xs text-neutral-500">
                            {combatant.deathSaves.successes}✓ {combatant.deathSaves.failures}✗
                          </span>
                          <button type="submit" name="success" value="true" className={chip}>
                            Save
                          </button>
                          <button type="submit" name="success" value="false" className={chip}>
                            Fail
                          </button>
                        </form>
                      )}

                      <form action={removeCombatantAction}>
                        <input type="hidden" name="encounterId" value={row.id} />
                        <input type="hidden" name="combatantId" value={combatant.id} />
                        <button
                          type="submit"
                          className="text-xs text-neutral-500 underline underline-offset-4"
                        >
                          Remove
                        </button>
                      </form>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {isGm && (
        <section className="mt-8 grid gap-6 sm:grid-cols-2">
          <form
            action={addCombatantAction}
            className="space-y-2 rounded-md border border-neutral-200 p-4 dark:border-neutral-800"
          >
            <h2 className="text-sm font-medium">Add a combatant</h2>
            <input type="hidden" name="encounterId" value={row.id} />
            <input name="name" placeholder="Name" required className={`${field} w-full`} />
            <div className="flex gap-2">
              <input
                name="initiative"
                placeholder="init (d20 if blank)"
                aria-label="Initiative"
                className={`${field} flex-1`}
              />
              <input
                name="hp"
                type="number"
                min={0}
                placeholder="HP"
                aria-label="Hit points"
                className={`${field} w-20`}
              />
              <input
                name="ac"
                type="number"
                min={0}
                placeholder="AC"
                aria-label="Armor class"
                className={`${field} w-20`}
              />
            </div>
            <select name="side" aria-label="Side" className={`${field} w-full`}>
              <option value="foe">Foe</option>
              <option value="party">Party</option>
              <option value="neutral">Neutral</option>
            </select>
            <button type="submit" className={chip}>
              Add
            </button>
          </form>

          <form
            action={rollAction}
            className="space-y-2 rounded-md border border-neutral-200 p-4 dark:border-neutral-800"
          >
            <h2 className="text-sm font-medium">Roll</h2>
            <input type="hidden" name="encounterId" value={row.id} />
            <input
              name="expression"
              placeholder="4d6kh3+2"
              aria-label="Dice expression"
              className={`${field} w-full font-mono`}
            />
            <p className="text-xs text-neutral-500">
              Supports keep/drop, rerolls, exploding, and clamps. Results go to the log.
            </p>
            <button type="submit" className={chip}>
              Roll
            </button>
          </form>
        </section>
      )}

      {state.log.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-medium">Log</h2>
          <ul className="space-y-1 text-xs">
            {[...state.log]
              .slice(-40)
              .reverse()
              .map((entry, i) => (
                <li key={i} className="flex gap-3">
                  <span className="w-12 shrink-0 text-neutral-400">R{entry.round}</span>
                  <span className="font-mono">{entry.message}</span>
                </li>
              ))}
          </ul>
        </section>
      )}
    </main>
  );
}
