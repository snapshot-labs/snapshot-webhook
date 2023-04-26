import PushNotifications from '@pusher/push-notifications-server';
import type { Event } from '../types';

export const sendPushNotification = async (event: Event, proposalTitle: string, to: string[]) => {
  const beams = new PushNotifications({
    instanceId: process.env.SERVICE_PUSHER_BEAMS_INSTANCE_ID ?? '',
    secretKey: process.env.SERVICE_PUSHER_BEAMS_SECRET_KEY ?? ''
  });

  await beams.publishToInterests(to, {
    web: {
      notification: {
        title: event.space,
        body: proposalTitle,
        deep_link: `${process.env.SNAPSHOT_URI}/#/${event.space}/${event.id}`
      }
    }
  });
};
