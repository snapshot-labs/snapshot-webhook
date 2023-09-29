import snapshot from '@snapshot-labs/snapshot.js';
import { capture } from '@snapshot-labs/snapshot-sentry';
import db from './helpers/mysql';
import { handleCreatedEvent, handleDeletedEvent } from './events';
import { getNextMessages } from './helpers/snapshot';

export let last_mci = 0;

async function getLastMci() {
  const query = 'SELECT value FROM _metadatas WHERE id = ? LIMIT 1';
  const results = await db.queryAsync(query, ['last_mci']);
  last_mci = parseInt(results[0].value);
  return last_mci;
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
        await handleCreatedEvent({ id: `proposal/${message.id}`, space: message.space });
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
  // Check latest indexed MCI from db
  const lastMci = await getLastMci();
  console.log('[replay] Last MCI', lastMci);

  // Load next messages after latest indexed MCI
  const messages = await getNextMessages(lastMci);
  if (messages && messages.length > 0) {
    await processMessages(messages);
  }

  // Run again after 10sec
  await snapshot.utils.sleep(10e3);
  return run();
}
