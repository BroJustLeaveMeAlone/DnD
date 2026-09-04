import { and, asc, desc, eq } from 'drizzle-orm';
import { roleIn } from './campaigns.js';
import type { Database } from './client.js';
import { encounters } from './schema/index.js';

/**
 * Encounter persistence.
 *
 * Every write requires GM membership in the owning campaign. Combat state is
 * the one thing at a table that players must not be able to edit directly —
 * a player who could set their own hit points has removed the game.
 */

export interface EncounterRow {
  id: string;
  campaignId: string;
  name: string;
  state: unknown;
  active: boolean;
}

export async function listEncounters(
  db: Database,
  campaignId: string,
  viewerId: string,
): Promise<EncounterRow[]> {
  // Players may read; only GMs may write.
  if (!(await roleIn(db, campaignId, viewerId))) return [];

  return db
    .select({
      id: encounters.id,
      campaignId: encounters.campaignId,
      name: encounters.name,
      state: encounters.state,
      active: encounters.active,
    })
    .from(encounters)
    .where(eq(encounters.campaignId, campaignId))
    .orderBy(desc(encounters.active), asc(encounters.name));
}

export async function getEncounter(
  db: Database,
  encounterId: string,
  viewerId: string,
): Promise<EncounterRow | undefined> {
  const [row] = await db
    .select({
      id: encounters.id,
      campaignId: encounters.campaignId,
      name: encounters.name,
      state: encounters.state,
      active: encounters.active,
    })
    .from(encounters)
    .where(eq(encounters.id, encounterId))
    .limit(1);

  if (!row) return undefined;
  if (!(await roleIn(db, row.campaignId, viewerId))) return undefined;
  return row;
}

export async function createEncounter(
  db: Database,
  input: { campaignId: string; gmId: string; name: string; state: unknown },
): Promise<string | undefined> {
  if ((await roleIn(db, input.campaignId, input.gmId)) !== 'gm') return undefined;

  const [created] = await db
    .insert(encounters)
    .values({ campaignId: input.campaignId, name: input.name, state: input.state })
    .returning({ id: encounters.id });

  return created?.id;
}

export async function saveEncounterState(
  db: Database,
  input: { encounterId: string; gmId: string; state: unknown },
): Promise<boolean> {
  const [row] = await db
    .select({ campaignId: encounters.campaignId })
    .from(encounters)
    .where(eq(encounters.id, input.encounterId))
    .limit(1);

  if (!row) return false;
  if ((await roleIn(db, row.campaignId, input.gmId)) !== 'gm') return false;

  await db
    .update(encounters)
    .set({ state: input.state, updatedAt: new Date() })
    .where(eq(encounters.id, input.encounterId));

  return true;
}

export async function deleteEncounter(
  db: Database,
  encounterId: string,
  gmId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ campaignId: encounters.campaignId })
    .from(encounters)
    .where(eq(encounters.id, encounterId))
    .limit(1);

  if (!row) return false;
  if ((await roleIn(db, row.campaignId, gmId)) !== 'gm') return false;

  const deleted = await db
    .delete(encounters)
    .where(eq(encounters.id, encounterId))
    .returning({ id: encounters.id });

  return deleted.length > 0;
}

/** Exactly one encounter per campaign is the live one. */
export async function setActiveEncounter(
  db: Database,
  input: { campaignId: string; gmId: string; encounterId: string | null },
): Promise<boolean> {
  if ((await roleIn(db, input.campaignId, input.gmId)) !== 'gm') return false;

  await db
    .update(encounters)
    .set({ active: false })
    .where(eq(encounters.campaignId, input.campaignId));

  if (input.encounterId) {
    await db
      .update(encounters)
      .set({ active: true })
      .where(
        and(eq(encounters.id, input.encounterId), eq(encounters.campaignId, input.campaignId)),
      );
  }

  return true;
}
