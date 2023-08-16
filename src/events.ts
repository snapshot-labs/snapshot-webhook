import snapshot from '@snapshot-labs/snapshot.js';
import { capture } from '@snapshot-labs/snapshot-sentry';
import db from './helpers/mysql';
import { getProposal, getSubscribers } from './helpers/utils';
import { send as sendDiscord } from './providers/discord';
import { send as sendBeams } from './providers/beams';
import { send as sendWebhook } from './providers/webhook';
import { send as sendXmtp } from './providers/xmtp';

const DELAY = 5;
const INTERVAL = 15;
const SERVICE_EVENTS = parseInt(process.env.SERVICE_EVENTS || '0');

export async function handleCreatedEvent(event) {
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
}

export async function handleDeletedEvent(event) {
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
}

async function processEvents() {
  const ts = ~~(Date.now() / 1e3) - DELAY;

  const events = await db.queryAsync('SELECT * FROM events WHERE expire <= ?', [ts]);
  console.log('[events] Process event start', ts, events.length);

  for (const event of events) {
    const proposalId = event.id.replace('proposal/', '');
    const proposal = await getProposal(proposalId);
    const subscribers = await getSubscribers(event.space);

    if (proposal) {
      // TODO: handle errors and retry
      sendBeams(event, proposal, subscribers);
      sendDiscord(event, proposal, subscribers);
      sendWebhook(event, proposal, subscribers);
      sendXmtp(event, proposal, subscribers);
    } else {
      console.log(`Proposal ${proposalId} not found`);
    }

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
    await processEvents();
  } catch (e) {
    capture(e);
    console.log('[events] Failed to process', e);
  }

  await snapshot.utils.sleep(INTERVAL * 1e3);
  await run();
}

if (SERVICE_EVENTS) {
  setTimeout(() => run(), INTERVAL * 1e3);
}
