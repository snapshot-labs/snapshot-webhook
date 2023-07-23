import fetch from 'node-fetch';
import snapshot from '@snapshot-labs/snapshot.js';
import { sendEventToDiscordSubscribers } from './discord';
import { sendPushNotification } from './helpers/beams';
import db from './helpers/mysql';
import { sha256 } from './helpers/utils';
import { getProposal } from './helpers/proposal';
import { capture } from './helpers/sentry';

const delay = 5;
const interval = 15;
const HTTP_WEBHOOK_TIMEOUT = 15000;
const serviceEvents = parseInt(process.env.SERVICE_EVENTS || '0');
const serviceEventsSalt = parseInt(process.env.SERVICE_EVENTS_SALT || '12345');
const servicePushNotifications = parseInt(process.env.SERVICE_PUSH_NOTIFICATIONS || '0');

export const handleCreatedEvent = async event => {
  const { space, id } = event;
  const proposalId = id.replace('proposal/', '') || '';
  const proposal = await getProposal(proposalId);
  if (!proposal) {
    console.log(`[events] Proposal not found ${proposalId}`);
    return;
  }

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

export const handleDeletedEvent = async event => {
  const { ipfs } = event;
  const ipfsData = await snapshot.utils.ipfsGet('pineapple.fyi', ipfs);
  const proposalId = ipfsData.data.message.proposal;

  event.id = `proposal/${proposalId}`;
  event.event = 'proposal/deleted';
  delete event.ipfs;

  const query = `
    DELETE FROM events WHERE id = ?;
    INSERT IGNORE INTO events SET ?;
  `;
  return db.queryAsync(query, [event.id, event]);
};

export async function sendEvent(event, to, method = 'POST') {
  event.token = sha256(`${to}${serviceEventsSalt}`);
  event.secret = sha256(`${to}${serviceEventsSalt}`);
  const headerSecret = sha256(`${to}${process.env.SERVICE_EVENTS_SALT}`);
  const url = to.replace('[PROPOSAL-ID]', event.id.split('/')[1]);
  try {
    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authentication: headerSecret
      },
      body: JSON.stringify(event),
      timeout: HTTP_WEBHOOK_TIMEOUT
    });
    return res.text();
  } catch (error: any) {
    if (error.message.includes('network timeout')) {
      console.error('[events] Timed out while sending the webhook', to);
    } else {
      console.error('[events] Error sending event data to webhook', to, JSON.stringify(error));
    }

    throw error;
  }
}

const sendEventToWebhookSubscribers = (event, subscribers) => {
  Promise.allSettled(
    subscribers
      .filter(subscriber => [event.space, '*'].includes(subscriber.space))
      .map(subscriber => sendEvent(event, subscriber.url, subscriber.method))
  )
    .then(() => console.log('[events] Process event done'))
    .catch(e => capture(e));
};

async function processEvents(subscribers) {
  const ts = parseInt((Date.now() / 1e3).toFixed()) - delay;
  const events = await db.queryAsync('SELECT * FROM events WHERE expire <= ?', [ts]);

  console.log('[events] Process event start', ts, events.length);

  for (const event of events) {
    const proposalId = event.id.replace('proposal/', '');

    // Send event to discord subscribers and webhook subscribers and then delete event from db
    // TODO: handle errors and retry
    if (servicePushNotifications && event.event === 'proposal/start') sendPushNotification(event);
    sendEventToDiscordSubscribers(event.event, proposalId);
    sendEventToWebhookSubscribers(event, subscribers);

    try {
      await db.queryAsync('DELETE FROM events WHERE id = ? AND event = ? LIMIT 1', [
        event.id,
        event.event
      ]);
      console.log(`[events] Event sent ${event.id} ${event.event}`);
    } catch (e) {
      capture(e);
      console.log('[events]', e);
    }
  }
}

async function run() {
  try {
    const subscribers = await db.queryAsync('SELECT * FROM subscribers');
    console.log('[events] Subscribers', subscribers.length);
    await processEvents(subscribers);
  } catch (e) {
    capture(e);
    console.log('[events] Failed to process', e);
  }
  await snapshot.utils.sleep(interval * 1e3);
  await run();
}

if (serviceEvents) setTimeout(() => run(), interval * 1e3);
