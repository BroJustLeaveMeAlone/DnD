import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { type Database, createDatabase } from './client.js';
import {
  type CampaignSubscription,
  type RealtimeEvent,
  campaignChannel,
  notifyCampaign,
  subscribeToCampaign,
} from './realtime.js';

config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });

const connectionString = process.env.DATABASE_URL;
const describeDb = connectionString ? describe : describe.skip;

describe('channel naming', () => {
  it('derives a plain identifier from a campaign id', () => {
    expect(campaignChannel('3f2504e0-4f89-41d3-9a0c-0305e82c3301')).toBe(
      'campaign_3f2504e0_4f89_41d3_9a0c_0305e82c3301',
    );
  });

  it('produces a name containing only characters safe to interpolate', () => {
    // The channel is interpolated into `LISTEN "..."`, so this is the property
    // that keeps that safe.
    expect(campaignChannel(randomUUID())).toMatch(/^campaign_[0-9a-f_]+$/);
  });

  it('lower-cases, so the same id never yields two channels', () => {
    const id = '3F2504E0-4F89-41D3-9A0C-0305E82C3301';
    expect(campaignChannel(id)).toBe(campaignChannel(id.toLowerCase()));
  });

  it.each([
    'not-a-uuid',
    '',
    'campaign_1; drop table users',
    '3f2504e0-4f89-41d3-9a0c-0305e82c3301 ; select 1',
    "'; LISTEN evil; --",
  ])('refuses `%s`', (bad) => {
    expect(() => campaignChannel(bad)).toThrow(/is not a campaign id/);
  });
});

describeDb('listen / notify', () => {
  let db: Database;
  const open: CampaignSubscription[] = [];

  const subscribe = async (campaignId: string, onEvent: (e: RealtimeEvent) => void) => {
    const subscription = await subscribeToCampaign(connectionString!, campaignId, onEvent);
    open.push(subscription);
    return subscription;
  };

  /** Resolves on the next event, or rejects so a hang fails fast. */
  const nextEvent = (campaignId: string, timeoutMs = 3000) =>
    new Promise<RealtimeEvent>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('no event within timeout')), timeoutMs);
      void subscribe(campaignId, (event) => {
        clearTimeout(timer);
        resolve(event);
      });
    });

  const settle = () => new Promise((resolve) => setTimeout(resolve, 300));

  beforeAll(() => {
    db = createDatabase(connectionString!);
  });

  afterEach(async () => {
    // A leaked LISTEN client per test would exhaust the connection limit long
    // before the suite finished.
    await Promise.all(open.splice(0).map((s) => s.close()));
  });

  it('delivers a notification to a subscriber', async () => {
    const campaignId = randomUUID();
    const received = nextEvent(campaignId);

    await settle();
    await notifyCampaign(db, campaignId, 'encounter');

    const event = await received;
    expect(event.kind).toBe('encounter');
    expect(event.campaignId).toBe(campaignId);
    expect(Date.parse(event.at)).not.toBeNaN();
  });

  it('carries the event kind through', async () => {
    const campaignId = randomUUID();
    const received = nextEvent(campaignId);

    await settle();
    await notifyCampaign(db, campaignId, 'campaign');

    expect((await received).kind).toBe('campaign');
  });

  it('does not leak across campaigns', async () => {
    // The whole point of a channel per campaign: one table's combat must never
    // reach another table's players.
    const mine = randomUUID();
    const theirs = randomUUID();
    const seen: RealtimeEvent[] = [];

    await subscribe(mine, (event) => seen.push(event));
    await settle();

    await notifyCampaign(db, theirs, 'encounter');
    await settle();

    expect(seen).toEqual([]);

    await notifyCampaign(db, mine, 'encounter');
    await settle();

    expect(seen.map((e) => e.campaignId)).toEqual([mine]);
  });

  it('stops delivering after close', async () => {
    const campaignId = randomUUID();
    const seen: RealtimeEvent[] = [];

    const subscription = await subscribe(campaignId, (event) => seen.push(event));
    await settle();

    await notifyCampaign(db, campaignId, 'encounter');
    await settle();
    expect(seen).toHaveLength(1);

    await subscription.close();
    await notifyCampaign(db, campaignId, 'encounter');
    await settle();

    expect(seen).toHaveLength(1);
  });

  it('closes idempotently', async () => {
    const subscription = await subscribe(randomUUID(), () => {});
    await subscription.close();
    await expect(subscription.close()).resolves.toBeUndefined();
  });

  it('fans out to every subscriber on the same campaign', async () => {
    // Two players watching one encounter both need the update.
    const campaignId = randomUUID();
    const a: RealtimeEvent[] = [];
    const b: RealtimeEvent[] = [];

    await subscribe(campaignId, (event) => a.push(event));
    await subscribe(campaignId, (event) => b.push(event));
    await settle();

    await notifyCampaign(db, campaignId, 'encounter');
    await settle();

    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
  });

  it('refuses to notify on an invalid campaign id', async () => {
    await expect(notifyCampaign(db, 'nope', 'encounter')).rejects.toThrow(/is not a campaign id/);
  });
});
