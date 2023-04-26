import snapshot from '@snapshot-labs/snapshot.js';
import { EnumType } from 'json-to-graphql-query';
import type { Proposal, Message } from '../types';

const hubURL = process.env.HUB_URL || 'https://hub.snapshot.org';

export async function getProposal(id: string) {
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
      created: true,
      snapshot: true
    }
  };
  const result = await snapshot.utils.subgraphRequest(`${hubURL}/graphql`, query);
  if (result.errors) {
    throw new Error(`Errors in subgraph request for proposal id: ${id}`);
  }
  return result.proposal as Proposal;
}

export async function getProposalScores(proposalId: string) {
  return snapshot.utils.getJSON(`${hubURL}/api/scores/${proposalId}`);
}

export async function checkSpace(space: string) {
  try {
    const spaceData = await snapshot.utils.getJSON(`${hubURL}/api/spaces/${space}`);
    return spaceData?.name;
  } catch (error) {
    return false;
  }
}

export async function getNextMessages(mci: number) {
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
    const results = await snapshot.utils.subgraphRequest(`${hubURL}/graphql`, query);
    return results.messages as Message[];
  } catch (e) {
    console.log('Failed to load messages', e);
    return [];
  }
}

export async function getSubscribers(space: string) {
  let subscriptions: { [key: string]: any }[] = [];
  const query = {
    subscriptions: {
      __args: {
        where: { space }
      },
      address: true
    }
  };
  try {
    const result = await snapshot.utils.subgraphRequest('https://hub.snapshot.org/graphql', query);
    subscriptions = result.subscriptions || [];
  } catch (error) {
    console.log('Snapshot hub error:', error);
  }
  return subscriptions.map(subscription => subscription.address as string);
}

export async function getIpfsData(ipfs: string) {
  return await snapshot.utils.ipfsGet('snapshot.mypinata.cloud', ipfs);
}
