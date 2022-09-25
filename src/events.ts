import fetch from 'cross-fetch';
import snapshot from '@snapshot-labs/snapshot.js';
import { sendEventToDiscordSubscribers } from './discord';
import { sendPushNotification } from './helpers/beams';
import db from './helpers/mysql';
import { sha256 } from './helpers/utils';
import { getProposal, getProposalScores } from './helpers/proposal';
import {
  getActiveSubscribers,
  updateActiveSubscribers,
  updateSubscribers
} from './helpers/subscribers';

const delay = 5;
const interval = 15;
const serviceEvents = parseInt(process.env.SERVICE_EVENTS || '0');
const serviceEventsSalt = parseInt(process.env.SERVICE_EVENTS_SALT || '12345');
const servicePushNotifications = parseInt(process.env.SERVICE_PUSH_NOTIFICATIONS || '0');

export const handleCreatedEvent = async event => {
  const { space, id } = event;
  const proposalId = id.replace('proposal/', '') || '';
  const proposal = await getProposal(proposalId);
  if (!proposal) throw new Error('Proposal not found');

  const proposalEvent = { id, space };
  const ts = Date.now() / 1e3;

  let query = 'INSERT IGNORE INTO events SET ?; ';
  const params = [
    {
      event: 'proposal/created',
      expire: proposal.created,
      ...proposalEvent
    }
  ];

  query += 'INSERT IGNORE INTO events SET ?; ';
  params.push({
    event: 'proposal/start',
    expire: proposal.start,
    ...proposalEvent
  });

  if (proposal.end > ts) {
    query += 'INSERT IGNORE INTO events SET ?; ';
    params.push({
      event: 'proposal/end',
      expire: proposal.end,
      ...proposalEvent
    });
  }
  return db.queryAsync(query, params);
};

export const handleDeletedEvent = event => {
  const { id } = event;
  const query = `
    DELETE FROM events WHERE id = ?;
    INSERT IGNORE INTO events SET ?;
  `;
  return db.queryAsync(query, [id, event]);
};

export async function sendEvent(event, to) {
  event.token = sha256(`${to}${serviceEventsSalt}`);
  event.secret = sha256(`${to}${serviceEventsSalt}`);
  const headerSecret = sha256(`${to}${process.env.SERVICE_EVENTS_SALT}`);
  try {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 10000); // Abort request after 10 seconds if there is no response
    const res = await fetch(to, {
      signal: controller.signal,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authentication: headerSecret
      },
      body: JSON.stringify(event)
    });
    if (res.status !== 200) {
      throw new Error(`${res.status} ${res.statusText}`);
    }
    return 'success';
  } catch (error) {
    console.log('[events] Error sending event data to webhook', to, JSON.stringify(error));
    return 'failed';
  }
}

const sendEventToWebhookSubscribers = async event => {
  const subscribers = await getActiveSubscribers(event.space);
  console.log('[events] Subscribers for this event: ', subscribers.length);
  if (!subscribers.length) return;
  try {
    const allSubscribersStatus = await Promise.all(
      subscribers.map(subscriber => sendEvent(event, subscriber.url))
    );
    updateSubscribers(subscribers, allSubscribersStatus);
  } catch (e) {
    console.log('[events] sendEventToWebhookSubscribers failed', e);
  }
};

async function processEvents() {
  const ts = parseInt((Date.now() / 1e3).toFixed()) - delay;
  const events = await db.queryAsync('SELECT * FROM events WHERE expire <= ?', [ts]);

  console.log('[events] Process event start', ts, events.length);

  for (const event of events) {
    const proposalId = event.id.replace('proposal/', '');
    if (event.event === 'proposal/end') {
      try {
        const scores = await getProposalScores(proposalId);
        console.log('[events] Stored scores on proposal/end', scores.scores_state, proposalId);
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

async function run() {
  await snapshot.utils.sleep(interval * 1e3);
  try {
    await processEvents();
  } catch (e) {
    console.log('[events] Failed to process', e);
  }
  updateActiveSubscribers();
  run();
}

if (serviceEvents) run();