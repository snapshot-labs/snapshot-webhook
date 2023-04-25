import { sendEventToDiscordSubscribers } from './discord';
import { sendPushNotification } from './helpers/beams';
import db from './helpers/mysql';
import { getProposalScores } from './helpers/proposal';
import { httpChannelQueue } from './queues';
import type { Event, Subscriber } from './types';

const delay = 5;
const servicePushNotifications = parseInt(process.env.SERVICE_PUSH_NOTIFICATIONS || '0');

async function sendEventToWebhookSubscribers(event: Event) {
  const subscribers = (await db.queryAsync('SELECT * FROM subscribers')) as Subscriber[];
  console.log('[events] Subscribers', subscribers.length);

  const data = subscribers
    .filter(subscriber => [event.space, '*'].includes(subscriber.space))
    .map(subscriber => ({ name: 'http', data: { event, to: subscriber.url } }));

  httpChannelQueue.addBulk(data);

  console.log('[events] Process event queued');
}

async function processEvents() {
  const ts = parseInt((Date.now() / 1e3).toFixed()) - delay;
  const events = (await db.queryAsync('SELECT * FROM events WHERE expire <= ?', [ts])) as Event[];

  console.log('[events] Process event start', ts, events.length);

  for (const event of events) {
    const proposalId = event.id.replace('proposal/', '');
    if (event.event === 'proposal/end') {
      try {
        const scores = await getProposalScores(proposalId);
        console.log('[events] Stored scores on proposal/end', proposalId, scores);
      } catch (e) {
        console.log('[events] getProposalScores failed:', e);
      }
    }

    // Send event to discord subscribers and webhook subscribers and then delete event from db
    // TODO: handle errors and retry
    if (servicePushNotifications && event.event === 'proposal/start') sendPushNotification(event);
    sendEventToDiscordSubscribers(event.event, proposalId);
    sendEventToWebhookSubscribers(event);

    try {
      await db.queryAsync('DELETE FROM events WHERE id = ? AND event = ? LIMIT 1', [
        event.id,
        event.event
      ]);
      console.log(`[events] Event sent ${event.id} ${event.event}`);
    } catch (e) {
      console.log('[events]', e);
    }
  }
}

export async function run() {
  try {
    await processEvents();
  } catch (e) {
    console.log('[events] Failed to process', e);
  }
}
