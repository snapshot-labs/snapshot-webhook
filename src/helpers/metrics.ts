import init, { client } from '@snapshot-labs/snapshot-metrics';
import { capture } from '@snapshot-labs/snapshot-sentry';
import { count } from 'drizzle-orm';
import { Express } from 'express';
import { db } from '../db';
import { events, subscribers, subscriptions } from '../schema';

const activeDatabaseCollections = new Set<Promise<void>>();

async function trackDatabaseCollection(collect: () => Promise<void>) {
  const running = collect();
  activeDatabaseCollections.add(running);
  try {
    await running;
  } finally {
    activeDatabaseCollections.delete(running);
  }
}

export default function initMetrics(app: Express) {
  const metrics = init(app, {
    whitelistedPath: [/^\/$/, /^\/api\/test$/],
    errorHandler: capture,
    db: db.$client
  });

  return {
    async stop() {
      metrics.stop();
      await Promise.allSettled(activeDatabaseCollections);
    }
  };
}

new client.Gauge({
  name: 'events_per_type_count',
  help: 'Number of events per type',
  labelNames: ['type'],
  collect() {
    return trackDatabaseCollection(async () => {
      // Drop series for event types no longer present, otherwise a type that
      // disappears from the table keeps reporting its last value forever.
      this.reset();
      const results = await db
        .select({ event: events.event, count: count() })
        .from(events)
        .groupBy(events.event);

      results.forEach(result => {
        this.set({ type: result.event }, result.count);
      });
    });
  }
});

new client.Gauge({
  name: 'subscribers_per_type_count',
  help: 'Number of subscribers per type',
  labelNames: ['type'],
  collect() {
    return trackDatabaseCollection(async () => {
      const [http, discord] = await Promise.all([
        db.$count(subscribers),
        db.$count(subscriptions)
      ]);
      this.set({ type: 'http' }, http);
      this.set({ type: 'discord' }, discord);
      // No xmtp count: the XMTP provider is disabled in providers/index.ts, so
      // its subscriber table is neither read nor written.
    });
  }
});

export const timeOutgoingRequest = new client.Histogram({
  name: 'http_webhook_duration_seconds',
  help: 'Duration in seconds of outgoing webhook requests',
  labelNames: ['method', 'status', 'provider'],
  buckets: [0.5, 1, 2, 5, 10, 15]
});

export const xmtpIncomingMessages = new client.Gauge({
  name: 'xmtp_incoming_messages_count',
  help: 'Number of incoming XMTP messages'
});

export const outgoingMessages = new client.Gauge({
  name: 'http_webhook_outgoing_messages_count',
  help: 'Number of messages sent to webhooks.',
  labelNames: ['status', 'provider']
});
