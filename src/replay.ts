import { capture, Sentry } from '@snapshot-labs/snapshot-sentry';
import snapshot from '@snapshot-labs/snapshot.js';
import { eq } from 'drizzle-orm';
import { EnumType } from 'json-to-graphql-query';
import { db, updateLastMci } from './db';
import { handleCreatedEvent, handleDeletedEvent } from './events';
import { LAST_MCI_METADATA_ID, metadatas } from './schema';

const hubURL = process.env.HUB_URL || 'https://hub.snapshot.org';

export let last_mci = 0;

async function getLastMci() {
  const result = await db.query.metadatas.findFirst({
    where: eq(metadatas.id, LAST_MCI_METADATA_ID)
  });
  if (!result) {
    throw new Error(
      "Missing 'last_mci' row in _metadatas: run `yarn db:set-mci <mci>` before starting replay"
    );
  }
  last_mci = parseInt(result.value);
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
  } catch (err: any) {
    capture(err, { contexts: { input: { query, mci } } });
    console.log('Failed to load messages', err);
    return;
  }
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
    } catch (err) {
      capture(err);
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
      await snapshot.utils.sleep(10e3);
    } catch (err) {
      console.error(err);
      capture(err);
      // Drain Sentry's transport queue (max 2s) so the event is delivered
      // before exit.
      await Sentry.close(2000);
      // CRASH THE ENTIRE SERVER
      process.exit(1);
    }
  }
}
