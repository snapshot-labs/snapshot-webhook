import { sha256 } from '../../../helpers/utils';
import type { Job } from 'bullmq';
import type { Event, Subscriber } from '../../../types';

const serviceEventsSalt = parseInt(process.env.SERVICE_EVENTS_SALT || '12345');

export default async (job: Job) => {
  const { event, to }: { event: Event; to: Subscriber['url'] } = job.data;

  try {
    const res = await fetch(to, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authentication: sha256(`${to}${serviceEventsSalt}`)
      },
      body: JSON.stringify(event)
    });
    return res.text();
  } catch (error) {
    console.log('[events] Error sending event data to webhook', to, JSON.stringify(error));
    return;
  }
};
