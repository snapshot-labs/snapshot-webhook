import PushNotifications from '@pusher/push-notifications-server';
import chunk from 'lodash.chunk';
import { capture } from '@snapshot-labs/snapshot-sentry';

const SERVICE_PUSH_NOTIFICATIONS = parseInt(process.env.SERVICE_PUSH_NOTIFICATIONS || '0');

const beams = new PushNotifications({
  instanceId: process.env.SERVICE_PUSHER_BEAMS_INSTANCE_ID ?? '',
  secretKey: process.env.SERVICE_PUSHER_BEAMS_SECRET_KEY ?? ''
});

export async function send(event, proposal, subscribers) {
  if (!SERVICE_PUSH_NOTIFICATIONS || event.event !== 'proposal/start') return;

  const walletsChunks = chunk(subscribers, 100);

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
}
