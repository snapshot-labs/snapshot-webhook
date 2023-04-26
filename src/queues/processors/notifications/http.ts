import { sha256 } from '../../../helpers/utils';
import type { Job } from 'bullmq';
import type { Event, Subscriber } from '../../../types';

const serviceEventsSalt = parseInt(process.env.SERVICE_EVENTS_SALT || '12345');

export default async (job: Job) => {
  const { event, to }: { event: Event; to: Subscriber['url'] } = job.data;

  try {
    const response = await fetch(to, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authentication: sha256(`${to}${serviceEventsSalt}`)
      },
      body: JSON.stringify(event)
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Code ${response.status}: ${response.statusText}`);
    }

    return true;
  } catch (error: any) {
    console.log(
      '[events] Error sending event data to webhook, will retry or fail',
      to,
      error.toString(),
      JSON.stringify(error)
    );
    throw error;
  }
};
