import { sendPushNotification } from '../../../helpers/beams';
import type { Job } from 'bullmq';
import type { Event, Proposal } from '../../../types';

export default async (job: Job) => {
  const {
    event,
    to,
    proposalTitle
  }: { event: Event; to: string[]; proposalTitle: Proposal['title'] } = job.data;

  sendPushNotification(event, proposalTitle, to);
};
