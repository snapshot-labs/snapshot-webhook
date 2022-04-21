import snapshot from '@snapshot-labs/snapshot.js';

export async function getSubscribedWallets(spaceID) {
  let subscriptions: { [key: string]: any } = [];
  const query = {
    subscriptions: {
      __args: {
        where: { space: spaceID }
      },
      address: true
    }
  };
  try {
    const result = await snapshot.utils.subgraphRequest('https://hub.snapshot.org/graphql', query);
    subscriptions = result.subscriptions || [];
  } catch (error) {
    console.log('[events] Snapshot hub error:', error);
  }
  return subscriptions.map(subscription => subscription.address);
}
