import { sendPushNotification } from './beams';
import { sendEventToDiscordSubscribers } from './../discord';
import fetch from 'cross-fetch';
import snapshot from '@snapshot-labs/snapshot.js';
import { sha256 } from '../utils';
import db from '../mysql';
import { getProposalScores } from '../helpers/proposal';

const delay = 5;
const interval = 30;
const serviceEventsSubscribers = process.env.SERVICE_EVENTS_SUBSCRIBERS || 0;
const serviceEvents = parseInt(process.env.SERVICE_EVENTS || '0');
const serviceEventsSalt = parseInt(process.env.SERVICE_EVENTS_SALT || '12345');
const servicePushNotifications = parseInt(process.env.SERVICE_PUSH_NOTIFICATIONS || '0');

export const handleCreatedEvent = event => {
  const { proposal, space, id } = event;
  const proposalEvent = {
    id,
    space
  };
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

async function sendEvent(event, to) {
  event.token = sha256(`${to}${serviceEventsSalt}`);
  event.secret = sha256(`${to}${serviceEventsSalt}`);
  const res = await fetch(to, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(event)
  });
  const response = await res.json();
  return response;
}

const sendEventToSubscribers = (event, subscribers) => {
  Promise.all(
    subscribers
      .filter(subscriber => !subscriber.spaces || subscriber.spaces.includes(event.space))
      .map(subscriber => sendEvent(event, subscriber.url))
  )
    .then(() => console.log('[events] Process event done'))
    .catch(e => console.log('[events] Process event failed', e));
};

async function processEvents(subscribers) {
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
    sendEventToSubscribers(event, subscribers);

    try {
      await db.queryAsync('DELETE FROM events WHERE id = ? AND event = ? LIMIT 1', [event.id, event.event]);
      console.log(`[events] Event sent ${event.id} ${event.event}`);
    } catch (e) {
      console.log('[events]', e);
    }
  }
}

if (serviceEvents && serviceEventsSubscribers) {
  setInterval(async () => {
    try {
      const subscribers = await snapshot.utils.getJSON(serviceEventsSubscribers);
      console.log('[events] Subscribers', subscribers.length);
      await processEvents(subscribers);
    } catch (e) {
      console.log('[events] Failed to process');
    }
  }, interval * 1e3);
}
