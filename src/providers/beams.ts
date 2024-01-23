import PushNotifications from '@pusher/push-notifications-server';
import chunk from 'lodash.chunk';
import { capture } from '@snapshot-labs/snapshot-sentry';
import { timeOutgoingRequest, outgoingMessages } from '../helpers/metrics';

const SERVICE_PUSH_NOTIFICATIONS = parseInt(
  process.env.SERVICE_PUSH_NOTIFICATIONS || '0'
);

const beams = new PushNotifications({
  instanceId: process.env.SERVICE_PUSHER_BEAMS_INSTANCE_ID ?? '',
  secretKey: process.env.SERVICE_PUSHER_BEAMS_SECRET_KEY ?? ''
});

export async function send(event, proposal, subscribers) {
  if (!SERVICE_PUSH_NOTIFICATIONS || event.event !== 'proposal/start') return;

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
            deep_link: `${proposal.link}?app=beams`
          }
        }
      });
      outgoingMessages.inc(
        { provider: 'beams', status: 1 },
        walletsChunk.length
      );
    }
    success = true;
  } catch (e) {
    capture(e);
  } finally {
    end({ status: success ? 200 : 500 });
  }
}
