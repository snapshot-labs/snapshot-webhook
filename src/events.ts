import { capture } from '@snapshot-labs/snapshot-sentry';
import snapshot from '@snapshot-labs/snapshot.js';
import { and, eq, lte, ne } from 'drizzle-orm';
import { db } from './db';
import { getProposal, getSubscribers } from './helpers/utils';
import providers from './providers';
import { events } from './schema';

const DELAY = 10;
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
  // CTE: atomic delete + insert, single round-trip. The delete excludes the
  // inserted key: CTEs share the statement's snapshot, so deleting the same
  // key the insert targets can still raise a duplicate-key error on re-runs.
  const deleted = db.$with('deleted').as(
    db
      .delete(events)
      .where(and(eq(events.id, id), ne(events.event, 'proposal/deleted')))
      .returning()
  );
  await db
    .with(deleted)
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
    const proposalId = event.id.replace('proposal/', '');
    let proposal;
    if (event.event === 'proposal/deleted') {
      proposal = { id: proposalId, space: { id: event.space } };
    } else {
      proposal = await getProposal(proposalId);
    }
    if (proposal) {
      const subscribers = await getSubscribers(event.space);
      providers.forEach(provider => {
        provider(event, proposal, subscribers);
      });
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
  while (true) {
    try {
      await processEvents();
    } catch (err) {
      capture(err);
      console.log('[events] Failed to process', err);
    } finally {
      await snapshot.utils.sleep(INTERVAL * 1e3);
    }
  }
}

export function start() {
  if (SERVICE_EVENTS) {
    setTimeout(() => run(), INTERVAL * 1e3);
  }
}
