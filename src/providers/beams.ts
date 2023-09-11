import PushNotifications from '@pusher/push-notifications-server';
import chunk from 'lodash.chunk';
import { capture } from '@snapshot-labs/snapshot-sentry';
import { timeOutgoingRequest } from '../helpers/metrics';

const SERVICE_PUSH_NOTIFICATIONS = parseInt(process.env.SERVICE_PUSH_NOTIFICATIONS || '0');

const beams = new PushNotifications({
  instanceId: process.env.SERVICE_PUSHER_BEAMS_INSTANCE_ID ?? '',
  secretKey: process.env.SERVICE_PUSHER_BEAMS_SECRET_KEY ?? ''
});

export async function send(event, proposal, subscribers: string[]) {
  if (!SERVICE_PUSH_NOTIFICATIONS || event.event !== 'proposal/start' || subscribers.length === 0) {
    return;
  }

  const walletsChunks = chunk(subscribers, 100);
  const end = timeOutgoingRequest.startTimer({ provider: 'beams' });
  let success = false;

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
    success = true;
  } catch (e) {
    capture(e);
  } finally {
    end({ status: success ? 200 : 500 });
  }
}
