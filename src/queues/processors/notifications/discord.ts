import { sendEventToDiscordSubscribers } from '../../../discord';
import type { Job } from 'bullmq';
import type { Event, Proposal } from '../../../types';

export default async (job: Job) => {
  const { event, proposalId }: { event: Event; proposalId: Proposal['id'] } = job.data;

  try {
    sendEventToDiscordSubscribers(event.event, proposalId);
  } catch (error: any) {
    console.log(
      '[worker:discord] Error sending notification, will retry or fail',
      error.toString(),
      JSON.stringify(error)
    );
    throw error;
  }
};
