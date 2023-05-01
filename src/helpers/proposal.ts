import snapshot from '@snapshot-labs/snapshot.js';

const hubURL = process.env.HUB_URL || 'https://hub.snapshot.org';

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
  const result = await snapshot.utils.subgraphRequest(`${hubURL}/graphql`, query);
  if (result.errors) {
    throw new Error(`[events] Errors in subgraph request for proposal id: ${id}`);
  }
  proposal = result.proposal || null;
  return proposal;
}

export async function getProposalScores(proposalId) {
  return snapshot.utils.getJSON(`${hubURL}/api/scores/${proposalId}`);
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
  const result = await snapshot.utils.subgraphRequest(`${hubURL}/graphql`, query);
  if (result.errors) {
    throw new Error(`[events] Errors in subgraph request for proposal id: ${id}`);
  }
  space = result.space || null;
  return space;
}
