import init, { client } from '@snapshot-labs/snapshot-metrics';
import type { Express } from 'express';
import { capture } from '@snapshot-labs/snapshot-sentry';
import db from './mysql';

export default function initMetrics(app: Express) {
  init(app, {
    whitelistedPath: [/^\/$/, /^\/api\/test$/],
    errorHandler: capture,
    db
  });
}

new client.Gauge({
  name: 'events_per_type_count',
  help: 'Number of events per type',
  labelNames: ['type'],
  async collect() {
    const result = await db.queryAsync(
      `SELECT count(*) as count, event FROM events GROUP BY event`
    );
    result.forEach(async function callback(this: any, data) {
      this.set({ type: data.event }, data.count);
    }, this);
  }
});

new client.Gauge({
  name: 'subscribers_per_type_count',
  help: 'Number of subscribers per type',
  labelNames: ['type'],
  async collect() {
    this.set(
      { type: 'http' },
      (await db.queryAsync(`SELECT count(*) as count FROM subscribers`))[0].count as any
    );
    this.set(
      { type: 'discord' },
      (await db.queryAsync(`SELECT count(*) as count FROM subscriptions`))[0].count as any
    );
    this.set(
      { type: 'xmtp' },
      (await db.queryAsync(`SELECT count(*) as count FROM xmtp WHERE status = 1`))[0].count as any
    );
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
