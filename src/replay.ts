import snapshot from '@snapshot-labs/snapshot.js';
import { EnumType } from 'json-to-graphql-query';
import db from './helpers/mysql';
import { handleCreatedEvent, handleDeletedEvent } from './events';

const hubURL = process.env.HUB_URL || 'https://hub.snapshot.org';

async function getLastMci() {
  const query = 'SELECT value FROM _metadatas WHERE id = ? LIMIT 1';
  const results = await db.queryAsync(query, ['last_mci']);
  return parseInt(results[0].value);
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
      type: true,
      timestamp: true,
      space: true
    }
  };

  try {
    const results = await snapshot.utils.subgraphRequest(`${hubURL}/graphql`, query);
    return results.messages;
  } catch (e) {
    console.log('Failed to load messages', e);
    return;
  }
}

async function processMessages(messages: any[]) {
  for (const message of messages) {
    if (message.type === 'proposal') {
      console.log('New event: "proposal"', message.space, message.id);
      await handleCreatedEvent({ id: `proposal/${message.id}`, space: message.space });
    }

    if (message.type === 'delete-proposal') {
      console.log('New event: "delete-proposal"', message.space, message.id);
      await handleDeletedEvent({ id: `proposal/${message.id}` });
    }
  }
}

async function updateLastMci(mci: number) {
  const query = 'UPDATE _metadatas SET value = ? WHERE id = ? LIMIT 1';
  await db.queryAsync(query, [mci.toString(), 'last_mci']);
}

async function run() {
  // Check latest indexed MCI from db
  const lastMci = await getLastMci();
  console.log('Last MCI', lastMci);

  // Load next messages after latest indexed MCI
  const messages = await getNextMessages(lastMci);
  if (!messages || messages.length === 0) return;

  // Process messages
  await processMessages(messages);

  // Store latest message MCI
  const lastMessageMci = messages.at(-1).mci;
  await updateLastMci(lastMessageMci);
  console.log('Updated to MCI', lastMessageMci);

  // Run again after 5sec
  await snapshot.utils.sleep(10e3);
  return run();
}

run();
