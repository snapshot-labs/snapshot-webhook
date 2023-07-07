import PushNotifications from '@pusher/push-notifications-server';
import snapshot from '@snapshot-labs/snapshot.js';
import chunk from 'lodash.chunk';
import { getProposal } from './proposal';
import { capture } from './sentry';

const beams = new PushNotifications({
  instanceId: process.env.SERVICE_PUSHER_BEAMS_INSTANCE_ID ?? '',
  secretKey: process.env.SERVICE_PUSHER_BEAMS_SECRET_KEY ?? ''
});

async function getSubscribers(space) {
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
    const result = await snapshot.utils.subgraphRequest('https://hub.snapshot.org/graphql', query);
    subscriptions = result.subscriptions || [];
  } catch (error) {
    capture(error);
  }
  return subscriptions.map(subscription => subscription.address);
}

export const sendPushNotification = async event => {
  const subscribedWallets = await getSubscribers(event.space);
  const walletsChunks = chunk(subscribedWallets, 100);
  const proposal = await getProposal(event.id.replace('proposal/', ''));
  if (!proposal) {
    console.log('[events] Proposal not found', event.id);
    return;
  }
  try {
    for await (const walletsChunk of walletsChunks) {
      await beams.publishToInterests(walletsChunk, {
        web: {
          notification: {
            title: event.space,
            body: proposal.title,
            deep_link: `${process.env.SNAPSHOT_URI}/#/${event.space}/${event.id}`
          }
        }
      });
    }
  } catch (e) {
    capture(e);
  }
};
