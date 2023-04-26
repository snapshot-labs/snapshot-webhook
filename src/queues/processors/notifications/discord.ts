import { sendEventToDiscordSubscribers } from '../../../discord';
import type { Job } from 'bullmq';
import type { Event, Proposal } from '../../../types';

export default async (job: Job) => {
  const { event, proposalId }: { event: Event; proposalId: Proposal['id'] } = job.data;

  sendEventToDiscordSubscribers(event.event, proposalId);
};
