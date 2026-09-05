import {
  type CampaignSubscription,
  type RealtimeEvent,
  getDatabase,
  roleIn,
  subscribeToCampaign,
} from '@ttrpg/db';
import { auth } from '@/server/auth';

/**
 * Server-Sent Events for one campaign.
 *
 * SSE rather than WebSockets: every update here travels one way, from the GM to
 * the table, and SSE needs no custom server. Adding a WebSocket server to a
 * Next.js App Router deployment means running something other than `next start`,
 * which would complicate the self-host story for no gain on a one-directional
 * feed. EventSource also reconnects on its own.
 *
 * The stream carries no state — only "something changed". Subscribers re-fetch
 * through the ordinary authorised page render, so this can never become a side
 * channel that hands a spectator data the page itself would withhold.
 */

export const dynamic = 'force-dynamic';
// A stream cannot run on the edge runtime: it needs a real Postgres connection.
export const runtime = 'nodejs';

const HEARTBEAT_MS = 25_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response('Not signed in', { status: 401 });
  }

  const { id } = await params;
  // Checked before it reaches the database: a malformed id would otherwise
  // surface as a Postgres cast error and a 500 rather than an honest 403.
  if (!UUID.test(id)) {
    return new Response('Not a member of this campaign', { status: 403 });
  }

  // The same membership check the campaign and encounter pages use. Anything
  // that can read the page can subscribe; nothing else can.
  const role = await roleIn(getDatabase(), id, session.user.id);
  if (!role) {
    return new Response('Not a member of this campaign', { status: 403 });
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    return new Response('Server misconfigured', { status: 500 });
  }

  const encoder = new TextEncoder();
  let subscription: CampaignSubscription | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let closed = false;

  /** Idempotent, because abort and cancel can both fire for one disconnect. */
  const release = async () => {
    if (closed) return;
    closed = true;
    if (heartbeat) clearInterval(heartbeat);
    await subscription?.close();
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // The client went away between the check and the write.
          void release();
        }
      };

      // An immediate comment flushes headers, so the browser reports the
      // connection as open rather than sitting in `CONNECTING`.
      send(': connected\n\n');

      try {
        subscription = await subscribeToCampaign(
          connectionString,
          id,
          (event: RealtimeEvent) => {
            send(`event: ${event.kind}\ndata: ${JSON.stringify(event)}\n\n`);
          },
          () => {
            // The listener's connection dropped. End this stream rather than
            // leaving a viewer silently subscribed to nothing; EventSource will
            // reconnect and get a fresh listener.
            void release();
            try {
              controller.close();
            } catch {
              // Already closed.
            }
          },
        );
      } catch {
        await release();
        controller.close();
        return;
      }

      // Comments keep proxies and load balancers from reaping an idle stream.
      heartbeat = setInterval(() => send(': ping\n\n'), HEARTBEAT_MS);

      // `cancel` covers most disconnects, but not every runtime calls it.
      request.signal.addEventListener('abort', () => {
        void release();
      });
    },

    async cancel() {
      await release();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // nginx buffers responses by default, which would hold every event until
      // the buffer filled — i.e. never, for a low-traffic feed.
      'X-Accel-Buffering': 'no',
    },
  });
}
