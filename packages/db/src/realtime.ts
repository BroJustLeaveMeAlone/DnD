import { sql } from 'drizzle-orm';
import { Client } from 'pg';
import type { Database } from './client.js';

/**
 * Realtime fan-out over Postgres LISTEN/NOTIFY.
 *
 * Using the database as the broker means no extra infrastructure and no shared
 * in-process state, so several app instances behind a load balancer still see
 * each other's events. See PROGRESS.md for why the transport to the browser is
 * SSE rather than WebSockets.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * One channel per campaign, so Postgres does the filtering rather than every
 * listener waking for every table's traffic.
 *
 * `LISTEN` takes an identifier, not a bound parameter, so the channel name is
 * interpolated into SQL. That is only safe because the campaign id is validated
 * as a UUID first and hyphens are then replaced — the result can contain
 * nothing but `[0-9a-f_]`. Do not relax the validation.
 */
export function campaignChannel(campaignId: string): string {
  if (!UUID.test(campaignId)) {
    throw new Error(`\`${campaignId}\` is not a campaign id`);
  }
  return `campaign_${campaignId.toLowerCase().replace(/-/g, '_')}`;
}

export type RealtimeEventKind = 'encounter' | 'campaign';

export interface RealtimeEvent {
  kind: RealtimeEventKind;
  campaignId: string;
  at: string;
}

/**
 * Announces that something a player can see has changed.
 *
 * The payload deliberately carries no state. Subscribers re-fetch through the
 * normal authorised path, so a notification can never become a side channel
 * that leaks GM-only data to a spectator.
 */
export async function notifyCampaign(
  db: Database,
  campaignId: string,
  kind: RealtimeEventKind,
): Promise<void> {
  const event: RealtimeEvent = { kind, campaignId, at: new Date().toISOString() };
  await db.execute(sql`select pg_notify(${campaignChannel(campaignId)}, ${JSON.stringify(event)})`);
}

export interface CampaignSubscription {
  close(): Promise<void>;
}

/**
 * Subscribes to one campaign's events.
 *
 * Holds a dedicated client rather than borrowing from the pool. `LISTEN` binds
 * to the specific connection that issued it, and a pooled connection is handed
 * back and reused the moment the query finishes — the subscription would
 * silently attach to a connection nobody is reading from, and no notification
 * would ever arrive.
 *
 * The returned `close` is not optional. One leaked client per viewer will
 * exhaust Postgres's connection limit during a busy session.
 */
export async function subscribeToCampaign(
  connectionString: string,
  campaignId: string,
  onEvent: (event: RealtimeEvent) => void,
  onError?: (error: Error) => void,
): Promise<CampaignSubscription> {
  const channel = campaignChannel(campaignId);
  const client = new Client({ connectionString });

  await client.connect();

  client.on('notification', (message) => {
    if (message.channel !== channel || !message.payload) return;
    try {
      onEvent(JSON.parse(message.payload) as RealtimeEvent);
    } catch {
      // A payload we cannot parse is not worth tearing the stream down for.
    }
  });

  // Without this handler a dropped connection becomes an unhandled 'error'
  // event, which takes the whole server process down rather than one viewer's
  // stream.
  client.on('error', (error: Error) => onError?.(error));

  await client.query(`LISTEN "${channel}"`);

  let closed = false;
  return {
    async close() {
      if (closed) return;
      closed = true;
      try {
        await client.end();
      } catch {
        // Already gone; nothing left to release.
      }
    },
  };
}
