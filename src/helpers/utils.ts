import { createHash } from 'crypto';
import snapshot from '@snapshot-labs/snapshot.js';
import { capture } from '@snapshot-labs/snapshot-sentry';

const HUB_URL = process.env.HUB_URL || 'https://hub.snapshot.org';

export function shortenAddress(str = '') {
  return `${str.slice(0, 6)}...${str.slice(str.length - 4)}`;
}

export function sha256(str) {
  return createHash('sha256').update(str).digest('hex');
}

export async function getSubscribers(space) {
  let subscriptions: { [key: string]: any } = [];
  const query = {
    subscriptions: {
      __args: {
        where: { space }
      },
      address: true
    }
  };
  try {
    const result = await snapshot.utils.subgraphRequest(`${HUB_URL}/graphql`, query);
    subscriptions = result.subscriptions || [];
  } catch (e: any) {
    capture(e, { contexts: { input: { query, space } } });
  }
  return subscriptions.map(subscription => subscription.address);
}

export async function getProposal(id) {
  let proposal: { [key: string]: any } | null = null;
  const query = {
    proposal: {
      __args: {
        id
      },
      space: {
        id: true,
        name: true,
        avatar: true
      },
      id: true,
      type: true,
      author: true,
      title: true,
      body: true,
      choices: true,
      start: true,
      end: true,
      link: true,
      snapshot: true
    }
  };

  try {
    const result = await snapshot.utils.subgraphRequest(`${HUB_URL}/graphql`, query);
    if (result.errors) {
      console.error(`[events] Errors in subgraph request for proposal id: ${id}`);
    }
    proposal = result.proposal || null;
    return proposal;
  } catch (e: any) {
    capture(e, { contexts: { input: { query, id } } });
    return null;
  }
}

export async function getSpace(id) {
  let space: { [key: string]: any } | null = null;
  const query = {
    space: {
      __args: {
        id
      },
      id: true,
      name: true
    }
  };
  try {
    const result = await snapshot.utils.subgraphRequest(`${HUB_URL}/graphql`, query);
    if (result.errors) {
      console.error(`[events] Errors in subgraph request for proposal id: ${id}`);
    }
    space = result.space || null;
    return space;
  } catch (e: any) {
    capture(e, { contexts: { input: { query, id } } });
    return null;
  }
}
