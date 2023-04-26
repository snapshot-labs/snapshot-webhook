import db from './helpers/mysql';
import { getProposal, getNextMessages, getIpfsData } from './helpers/snapshot';
import type { Message, Event } from './types';

const handleCreatedEvent = async (event: Pick<Event, 'space' | 'id'>) => {
  console.log(`[relay] -- Inserting new event in DB`);
  const { space, id } = event;
  const proposalId = id.replace('proposal/', '') || '';
  const proposal = await getProposal(proposalId);
  if (!proposal) {
    console.log(`[relay] -- Proposal not found ${proposalId}`);
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

const handleDeletedEvent = async (event: Partial<Event>, ipfs: string) => {
  console.log(`[relay] -- Removing deleted event from DB`);
  const ipfsData = await getIpfsData(ipfs);
  const proposalId = ipfsData.data.message.proposal;

  event.id = `proposal/${proposalId}`;
  event.event = 'proposal/deleted';

  const query = `
    DELETE FROM events WHERE id = ?;
    INSERT IGNORE INTO events SET ?;
  `;
  return db.queryAsync(query, [event.id, event]);
};

export async function getLastMci() {
  const query = 'SELECT value FROM _metadatas WHERE id = ? LIMIT 1';
  const results = await db.queryAsync(query, ['last_mci']);
  return parseInt(results[0].value as string);
}

async function updateLastMci(mci: number) {
  const query = 'UPDATE _metadatas SET value = ? WHERE id = ? LIMIT 1';
  await db.queryAsync(query, [mci.toString(), 'last_mci']);
}

async function processMessages(messages: Message[]) {
  console.log(`[replay] - PROCESS: Process ${messages.length} messages`);
  let lastMessageMci: number | null = null;

  for (const message of messages) {
    try {
      if (message.type === 'proposal') {
        console.log('[replay] - New event: "proposal"', message.space, message.id);
        await handleCreatedEvent({ id: `proposal/${message.id}`, space: message.space });
      }

      if (message.type === 'delete-proposal') {
        console.log('[replay] - New event: "delete-proposal"', message.space, message.id);
        await handleDeletedEvent(
          {
            space: message.space
          },
          message.ipfs
        );
      }
      lastMessageMci = message.mci;
    } catch (error) {
      console.log('[replay] Failed to process message', message.id, error);
      break;
    }
  }
  if (lastMessageMci !== null) {
    await updateLastMci(lastMessageMci);
    console.log(`[replay] - Updated lastMCI to ${lastMessageMci}`);
  }
  console.log('[replay] - PROCESS: End');
}

export async function run() {
  // Check latest indexed MCI from db
  const lastMci = await getLastMci();
  console.log(`[replay] RUN: Start from MCI ${lastMci}`);

  const messages = await getNextMessages(lastMci);
  console.log(`[replay] Found ${messages.length} new messages`);
  if (messages.length > 0) {
    await processMessages(messages);
  }
  console.log('[replay] RUN: End');
}
