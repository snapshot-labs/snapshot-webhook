import chunk from 'lodash.chunk';
import PushNotifications from '@pusher/push-notifications-server';
import { getSubscribedWallets } from '../helpers/subscriptions';
import { getProposal } from '../helpers/proposal';

const beams = new PushNotifications({
  instanceId: process.env.SERVICE_PUSHER_BEAMS_INSTANCE_ID ?? '',
  secretKey: process.env.SERVICE_PUSHER_BEAMS_SECRET_KEY ?? ''
});

export const sendPushNotification = async event => {
  const subscribedWallets = await getSubscribedWallets(event.space);
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
  } catch (error) {
    console.log('[events] Error sending push notification', error);
  }
};
