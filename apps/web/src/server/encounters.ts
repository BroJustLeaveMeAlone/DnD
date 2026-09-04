'use server';

import {
  createEncounter,
  deleteEncounter,
  getDatabase,
  getEncounter,
  saveEncounterState,
} from '@ttrpg/db';
import {
  type EncounterLike,
  addCondition,
  applyDamage,
  applyHealing,
  concentrationDc,
  grantTemporaryHitPoints,
  nextTurn,
  recordDeathSave,
  removeCondition,
  roll,
  startEncounter,
  tryParseDice,
} from '@ttrpg/rules-engine';
import { encounterState } from '@ttrpg/schemas';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { auth } from './auth';

async function requireUserId(): Promise<string> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) redirect('/');
  return id;
}

const EMPTY = { round: 0, turn: 0, started: false, combatants: [], log: [] };

export async function createEncounterAction(form: FormData): Promise<void> {
  const gmId = await requireUserId();
  const campaignId = String(form.get('campaignId') ?? '');
  const name = String(form.get('name') ?? '').trim() || 'Encounter';

  const id = await createEncounter(getDatabase(), { campaignId, gmId, name, state: EMPTY });
  if (!id) redirect(`/campaigns/${campaignId}?error=forbidden`);

  revalidatePath(`/campaigns/${campaignId}`);
  redirect(`/encounters/${id}`);
}

/**
 * Every mutation reads the stored state, validates it, applies a pure
 * transition, and writes the whole document back.
 *
 * Re-validating on read is deliberate: the column is JSONB, and a schema change
 * between write and read would otherwise hand a transition a shape it cannot
 * process. Failing loudly here beats corrupting an encounter mid-session.
 */
async function mutate(
  encounterId: string,
  gmId: string,
  change: (state: EncounterLike) => EncounterLike,
): Promise<void> {
  const db = getDatabase();
  const row = await getEncounter(db, encounterId, gmId);
  if (!row) redirect('/campaigns?error=forbidden');

  const parsed = encounterState.safeParse(row.state);
  if (!parsed.success) redirect(`/encounters/${encounterId}?error=corrupt-state`);

  const ok = await saveEncounterState(db, {
    encounterId,
    gmId,
    state: change(parsed.data as unknown as EncounterLike),
  });
  if (!ok) redirect(`/encounters/${encounterId}?error=forbidden`);

  revalidatePath(`/encounters/${encounterId}`);
}

export async function addCombatantAction(form: FormData): Promise<void> {
  const gmId = await requireUserId();
  const encounterId = String(form.get('encounterId') ?? '');

  const name = String(form.get('name') ?? '').trim();
  if (!name) redirect(`/encounters/${encounterId}?error=missing-name`);

  const max = Math.max(0, Number(form.get('hp') ?? 10) || 10);
  const ac = Math.max(0, Number(form.get('ac') ?? 10) || 10);

  // Initiative is rolled once here rather than derived per render, so the order
  // cannot shift mid-combat.
  const initiativeInput = String(form.get('initiative') ?? '').trim();
  const initiative = initiativeInput ? Number(initiativeInput) || 0 : roll('1d20').total;

  await mutate(encounterId, gmId, (state) => ({
    ...state,
    combatants: [
      ...state.combatants,
      {
        id: `c${Date.now().toString(36)}${state.combatants.length}`,
        name,
        side: String(form.get('side') ?? 'foe'),
        initiative,
        tiebreak: Math.random(),
        hp: { current: max, max, temporary: 0 },
        ac,
        conditions: [],
        characterId: null,
        concentratingOn: null,
        deathSaves: { successes: 0, failures: 0 },
        defeated: false,
      },
    ],
  }));

  redirect(`/encounters/${encounterId}`);
}

export async function removeCombatantAction(form: FormData): Promise<void> {
  const gmId = await requireUserId();
  const encounterId = String(form.get('encounterId') ?? '');
  const id = String(form.get('combatantId') ?? '');

  await mutate(encounterId, gmId, (state) => ({
    ...state,
    combatants: state.combatants.filter((c) => c.id !== id),
    // Clamp the pointer so removing the last combatant cannot leave the turn
    // index past the end of the order.
    turn: Math.min(state.turn, Math.max(0, state.combatants.length - 2)),
  }));

  redirect(`/encounters/${encounterId}`);
}

export async function startEncounterAction(form: FormData): Promise<void> {
  const gmId = await requireUserId();
  const encounterId = String(form.get('encounterId') ?? '');
  await mutate(encounterId, gmId, (state) => startEncounter(state));
  redirect(`/encounters/${encounterId}`);
}

export async function nextTurnAction(form: FormData): Promise<void> {
  const gmId = await requireUserId();
  const encounterId = String(form.get('encounterId') ?? '');
  await mutate(encounterId, gmId, (state) => nextTurn(state).encounter);
  redirect(`/encounters/${encounterId}`);
}

export async function damageAction(form: FormData): Promise<void> {
  const gmId = await requireUserId();
  const encounterId = String(form.get('encounterId') ?? '');
  const combatantId = String(form.get('combatantId') ?? '');
  const input = String(form.get('amount') ?? '').trim();
  const heal = form.get('heal') === 'true';

  // The field takes a number or dice notation, so a GM can type `2d6+3`.
  const numeric = Number(input);
  const amount =
    Number.isFinite(numeric) && input !== ''
      ? numeric
      : tryParseDice(input).ok
        ? roll(input).total
        : 0;
  if (amount <= 0) redirect(`/encounters/${encounterId}?error=bad-amount`);

  await mutate(encounterId, gmId, (state) => {
    if (heal) return applyHealing(state, combatantId, amount);

    const result = applyDamage(state, combatantId, amount, {
      concentrationThreshold: concentrationDc(amount),
    });

    if (!result.concentrationAtRisk) return result.encounter;

    // Surfacing the DC in the log means the GM never has to compute it.
    const target = state.combatants.find((c) => c.id === combatantId);
    return {
      ...result.encounter,
      log: [
        ...result.encounter.log,
        {
          round: result.encounter.round,
          message: `${target?.name ?? 'Target'} must make a DC ${concentrationDc(amount)} concentration save`,
          at: new Date().toISOString(),
        },
      ],
    };
  });

  redirect(`/encounters/${encounterId}`);
}

export async function temporaryHitPointsAction(form: FormData): Promise<void> {
  const gmId = await requireUserId();
  const encounterId = String(form.get('encounterId') ?? '');
  const combatantId = String(form.get('combatantId') ?? '');
  const amount = Math.max(0, Number(form.get('amount') ?? 0) || 0);

  await mutate(encounterId, gmId, (state) => grantTemporaryHitPoints(state, combatantId, amount));
  redirect(`/encounters/${encounterId}`);
}

export async function conditionAction(form: FormData): Promise<void> {
  const gmId = await requireUserId();
  const encounterId = String(form.get('encounterId') ?? '');
  const combatantId = String(form.get('combatantId') ?? '');
  const key = String(form.get('condition') ?? '').trim();
  const remove = form.get('remove') === 'true';
  const roundsRaw = String(form.get('rounds') ?? '').trim();

  if (!key) redirect(`/encounters/${encounterId}`);

  await mutate(encounterId, gmId, (state) =>
    remove
      ? removeCondition(state, combatantId, key)
      : addCondition(state, combatantId, {
          key,
          rounds: roundsRaw ? Number(roundsRaw) || null : null,
        }),
  );
  redirect(`/encounters/${encounterId}`);
}

export async function deathSaveAction(form: FormData): Promise<void> {
  const gmId = await requireUserId();
  const encounterId = String(form.get('encounterId') ?? '');
  const combatantId = String(form.get('combatantId') ?? '');
  const success = form.get('success') === 'true';

  await mutate(encounterId, gmId, (state) => recordDeathSave(state, combatantId, success));
  redirect(`/encounters/${encounterId}`);
}

export async function rollAction(form: FormData): Promise<void> {
  const gmId = await requireUserId();
  const encounterId = String(form.get('encounterId') ?? '');
  const expression = String(form.get('expression') ?? '').trim();

  const parsed = tryParseDice(expression);
  if (!parsed.ok)
    redirect(`/encounters/${encounterId}?error=${encodeURIComponent(parsed.error.message)}`);

  const result = roll(expression);
  await mutate(encounterId, gmId, (state) => ({
    ...state,
    log: [
      ...state.log,
      { round: state.round, message: result.breakdown, at: new Date().toISOString() },
    ].slice(-500),
  }));

  redirect(`/encounters/${encounterId}`);
}

export async function deleteEncounterAction(form: FormData): Promise<void> {
  const gmId = await requireUserId();
  const campaignId = String(form.get('campaignId') ?? '');
  await deleteEncounter(getDatabase(), String(form.get('encounterId') ?? ''), gmId);
  revalidatePath(`/campaigns/${campaignId}`);
  redirect(`/campaigns/${campaignId}`);
}
