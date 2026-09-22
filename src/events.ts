import { capture } from '@snapshot-labs/snapshot-sentry';
import snapshot from '@snapshot-labs/snapshot.js';
import { and, eq, lte } from 'drizzle-orm';
import { db } from './db';
import { getProposal, getSubscribers } from './helpers/utils';
import providers from './providers';
import { events } from './schema';

const DELAY = 10;
const INTERVAL = 15;

let timer: NodeJS.Timeout | undefined;
let running: Promise<void> | undefined;
let stopped = false;

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

  const rows = [
    {
      event: 'proposal/created',
      expire: proposal.created,
      ...proposalEvent
    },
    {
      event: 'proposal/start',
      expire: proposal.start,
      ...proposalEvent
    }
  ];

  if (proposal.end > ts) {
    rows.push({
      event: 'proposal/end',
      expire: proposal.end,
      ...proposalEvent
    });
  }
  return db.insert(events).values(rows).onConflictDoNothing();
}

export async function handleDeletedEvent(event) {
  const { ipfs } = event;
  const ipfsData = await snapshot.utils.ipfsGet('pineapple.fyi', ipfs);
  const proposalId = ipfsData.data.message.proposal;

  const id = `proposal/${proposalId}`;

  // expire 0 makes the deleted event fire on the next processing cycle.
  // Not atomic: replay retries on failure and both statements are idempotent.
  await db.delete(events).where(eq(events.id, id));
  await db
    .insert(events)
    .values({ id, event: 'proposal/deleted', space: event.space, expire: 0 })
    .onConflictDoNothing();
}

async function processEvents() {
  const ts = ~~(Date.now() / 1e3) - DELAY;

  const expiredEvents = await db.query.events.findMany({
    where: lte(events.expire, ts)
  });
  console.log('[events] Process event start', ts, expiredEvents.length);

  for (const event of expiredEvents) {
    if (stopped) break;

    const proposalId = event.id.replace('proposal/', '');
    let proposal;
    if (event.event === 'proposal/deleted') {
      proposal = { id: proposalId, space: { id: event.space } };
    } else {
      proposal = await getProposal(proposalId);
    }
    if (proposal) {
      const subscribers = await getSubscribers(event.space);
      await Promise.allSettled(
        providers.map(provider => provider(event, proposal, subscribers))
      );
    } else {
      console.log(`[events] Proposal ${proposalId} not found`);
    }

    try {
      await db
        .delete(events)
        .where(and(eq(events.id, event.id), eq(events.event, event.event)));
      console.log(`[events] Event sent ${event.id} ${event.event}`);
    } catch (err) {
      capture(err);
      console.log('[events]', err);
    }
  }
}

async function run() {
  running = processEvents().catch(err => {
    capture(err);
    console.log('[events] Failed to process', err);
  });
  await running;

  if (!stopped) timer = setTimeout(run, INTERVAL * 1e3);
}

export function start() {
  stopped = false;
  timer = setTimeout(run, INTERVAL * 1e3);
}

export async function stop() {
  stopped = true;
  clearTimeout(timer);
  await running;
  console.log('[events] Loop stopped');
}
