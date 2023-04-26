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
  console.log(`[events] -- [queue][http]: Start`);
  const subscribers = (await db.queryAsync('SELECT * FROM subscribers')) as Subscriber[];

  const data = subscribers
    .filter(subscriber => [event.space, '*'].includes(subscriber.space))
    .map(subscriber => ({ name: 'http', data: { event, to: subscriber.url } }));

  httpNotificationsQueue.addBulk(data);
  console.log(`[events] -- [queue][http]: End, queued ${subscribers.length} jobs`);
}

async function queuePushNotifications(event: Event, proposal: Proposal) {
  if (
    parseInt(process.env.SERVICE_PUSH_NOTIFICATIONS || '0') !== 0 ||
    event.event !== 'proposal/start'
  ) {
    return;
  }

  console.log(`[events] -- [queue][push]: Start`);
  const subscribedWallets = await getSubscribers(event.space);
  const walletsChunks = chunk(subscribedWallets, 100);

  const data = walletsChunks.map(chunk => {
    return { name: 'push', data: { event, proposalTitle: proposal.title, to: chunk } };
  });

  pushNotificationsQueue.addBulk(data);
  console.log(`[events] -- [queue][push]: End, queued ${walletsChunks.length} jobs`);
}

async function queueDiscordNotifications(event: Event, proposal: Proposal) {
  console.log(`[events] -- [queue][discord]: Start`);
  discordNotificationsQueue.add('discord', { event, proposalId: proposal.id });
  console.log(`[events] -- [queue][discord]: End, queued 1 job`);
}

async function processEvents() {
  const ts = parseInt((Date.now() / 1e3).toFixed()) - DELAY;
  const events = (await db.queryAsync('SELECT * FROM events WHERE expire <= ?', [ts])) as Event[];
  console.log(`[events] - PROCESS: Process ${events.length} events, at ${ts}`);

  for (const event of events) {
    const proposalId = event.id.replace('proposal/', '');
    if (event.event === 'proposal/end') {
      try {
        const scores = await getProposalScores(proposalId);
        console.log('[events] - Stored scores on proposal/end', proposalId, scores);
      } catch (e) {
        console.log('[events] - getProposalScores failed:', e);
      }
    }

    const proposal = await getProposal(proposalId);
    if (!proposal) {
      console.log('[events] - Proposal not found', proposalId);
    } else {
      queuePushNotifications(event, proposal);
      queueHttpNotifications(event);
      queueDiscordNotifications(event, proposal);
    }

    try {
      await db.queryAsync('DELETE FROM events WHERE id = ? AND event = ? LIMIT 1', [
        event.id,
        event.event
      ]);
      console.log(`[events] - Popping events ${event.id} ${event.event} from the DB`);
    } catch (e) {
      console.log(
        `[events] - Error while popping events ${event.id} ${event.event} from the DB`,
        e
      );
    }
  }
  console.log('[events] - PROCESS: End');
}

export async function run() {
  console.log('[events] RUN: Start');
  await processEvents();
  console.log('[events] RUN: End');
}
