import chunk from 'lodash.chunk';
import db from './helpers/mysql';
import { getProposalScores, getProposal, getSubscribers } from './helpers/snapshot';
import {
  httpNotificationsQueue,
  pushNotificationsQueue,
  discordNotificationsQueue
} from './queues';
import type { Event, Subscriber, Proposal } from './types';

const DELAY = 5;

async function queueHttpNotifications(event: Event) {
  const subscribers = (await db.queryAsync('SELECT * FROM subscribers')) as Subscriber[];
  console.log('[events] Subscribers', subscribers.length);

  const data = subscribers
    .filter(subscriber => [event.space, '*'].includes(subscriber.space))
    .map(subscriber => ({ name: 'http', data: { event, to: subscriber.url } }));

  httpNotificationsQueue.addBulk(data);

  console.log('[events] Process event queued');
}

async function queuePushNotifications(event: Event, proposal: Proposal) {
  if (
    parseInt(process.env.SERVICE_PUSH_NOTIFICATIONS || '0') !== 0 ||
    event.event !== 'proposal/start'
  ) {
    return;
  }

  const subscribedWallets = await getSubscribers(event.space);
  const walletsChunks = chunk(subscribedWallets, 100);

  const data = walletsChunks.map(chunk => {
    return { name: 'push', data: { event, proposalTitle: proposal.title, to: chunk } };
  });

  pushNotificationsQueue.addBulk(data);
}

async function queueDiscordNotifications(event: Event, proposal: Proposal) {
  discordNotificationsQueue.add('discord', { event, proposalId: proposal.id });
}

async function processEvents() {
  const ts = parseInt((Date.now() / 1e3).toFixed()) - DELAY;
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

    const proposal = await getProposal(event.id.replace('proposal/', ''));
    if (!proposal) {
      console.log('[events] Proposal not found', event.id);
      return;
    }

    queuePushNotifications(event, proposal);
    queueHttpNotifications(event);
    queueDiscordNotifications(event, proposal);

    try {
      await db.queryAsync('DELETE FROM events WHERE id = ? AND event = ? LIMIT 1', [
        event.id,
        event.event
      ]);
      console.log(`[events] Events jobs queued ${event.id} ${event.event}`);
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
