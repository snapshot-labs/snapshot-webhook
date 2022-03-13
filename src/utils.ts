import { createHash } from 'crypto';
import snapshot from '@snapshot-labs/snapshot.js';

export function shortenAddress(str = '') {
  return `${str.slice(0, 6)}...${str.slice(str.length - 4)}`;
}

export function sha256(str) {
  return createHash('sha256')
    .update(str)
    .digest('hex');
}

export function sendError(res, description, status = 500) {
  return res.status(status).json({
    error: 'unauthorized',
    error_description: description
  });
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
      snapshot: true
    }
  };
  try {
    const result = await snapshot.utils.subgraphRequest('https://hub.snapshot.org/graphql', query);
    proposal = result.proposal || null;
  } catch (error) {
    console.log('[events] Snapshot hub error:', error);
  }
  return proposal;
}

export async function getProposalScores(proposalId) {
  return snapshot.utils.getJSON(`https://hub.snapshot.org/api/scores/${proposalId}`);
}
