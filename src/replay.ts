import { capture, Sentry } from '@snapshot-labs/snapshot-sentry';
import snapshot from '@snapshot-labs/snapshot.js';
import { EnumType } from 'json-to-graphql-query';
import { getLastMci, updateLastMci } from './db';
import { handleCreatedEvent, handleDeletedEvent } from './events';

const hubURL = process.env.HUB_URL || 'https://hub.snapshot.org';
const INTERVAL = 10e3;

let timer: NodeJS.Timeout | undefined;
let running: Promise<void> | undefined;
let stopped = false;

export let last_mci = 0;

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
    if (stopped) break;

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

async function cycle() {
  try {
    // Check latest indexed MCI from db
    last_mci = await getLastMci();
    console.log('[replay] Last MCI', last_mci);

    // Load next messages after latest indexed MCI
    const messages = await getNextMessages(last_mci);
    if (messages && messages.length > 0) {
      await processMessages(messages);
    }
  } catch (err) {
    console.error(err);
    capture(err);
    await Sentry.close(2000);
    // CRASH THE ENTIRE SERVER
    process.exit(1);
  }
}

async function run() {
  running = cycle();
  await running;

  if (!stopped) timer = setTimeout(run, INTERVAL);
}

export function start() {
  stopped = false;
  run();
}

export async function stop() {
  stopped = true;
  clearTimeout(timer);
  await running;
  console.log('[replay] Loop stopped');
}
