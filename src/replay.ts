import snapshot from '@snapshot-labs/snapshot.js';
import { EnumType } from 'json-to-graphql-query';
import db from './helpers/mysql';
import { capture } from '@snapshot-labs/snapshot-sentry';
import { handleCreatedEvent, handleDeletedEvent } from './events';

const hubURL = process.env.HUB_URL || 'https://hub.snapshot.org';

export let last_mci = 0;

async function getLastMci() {
  const query = 'SELECT value FROM _metadatas WHERE id = ? LIMIT 1';
  const results = await db.queryAsync(query, ['last_mci']);
  last_mci = parseInt(results[0].value);
  return last_mci;
}

async function getNextMessages(mci: number) {
  const query = {
    messages: {
      __args: {
        first: 10,
        where: {
          type_in: ['proposal', 'delete-proposal'],
          mci_gt: mci
        },
        orderBy: 'mci',
        orderDirection: new EnumType('asc')
      },
      mci: true,
      id: true,
      ipfs: true,
      type: true,
      timestamp: true,
      space: true
    }
  };

  try {
    const results = await snapshot.utils.subgraphRequest(
      `${hubURL}/graphql`,
      query
    );
    return results.messages;
  } catch (e: any) {
    capture(e, { contexts: { input: { query, mci } } });
    console.log('Failed to load messages', e);
    return;
  }
}

async function updateLastMci(mci: number) {
  const query = 'UPDATE _metadatas SET value = ? WHERE id = ? LIMIT 1';
  await db.queryAsync(query, [mci.toString(), 'last_mci']);
}

async function processMessages(messages: any[]) {
  let lastMessageMci = null;
  for (const message of messages) {
    try {
      if (message.type === 'proposal') {
        console.log('New event: "proposal"', message.space, message.id);
        await handleCreatedEvent({
          id: `proposal/${message.id}`,
          space: message.space
        });
      }

      if (message.type === 'delete-proposal') {
        console.log('New event: "delete-proposal"', message.space, message.id);
        await handleDeletedEvent({
          space: message.space,
          ipfs: message.ipfs
        });
      }
      lastMessageMci = message.mci;
    } catch (error) {
      capture(error);
      break;
    }
  }
  if (lastMessageMci !== null) {
    // Store latest message MCI
    await updateLastMci(lastMessageMci);
    console.log('[replay] Updated to MCI', lastMessageMci);
  }
  return;
}

export async function run() {
  while (true) {
    try {
      // Check latest indexed MCI from db
      const lastMci = await getLastMci();
      console.log('[replay] Last MCI', lastMci);

      // Load next messages after latest indexed MCI
      const messages = await getNextMessages(lastMci);
      if (messages && messages.length > 0) {
        await processMessages(messages);
      }
    } catch (error) {
      console.error('[replay] Error in run loop:', error);
    } finally {
      await snapshot.utils.sleep(10e3);
    }
  }
}
