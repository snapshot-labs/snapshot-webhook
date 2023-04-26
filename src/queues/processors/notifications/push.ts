import { sendPushNotification } from '../../../helpers/beams';
import type { Job } from 'bullmq';
import type { Event, Proposal } from '../../../types';

export default async (job: Job) => {
  const {
    event,
    to,
    proposalTitle
  }: { event: Event; to: string[]; proposalTitle: Proposal['title'] } = job.data;

  try {
    await sendPushNotification(event, proposalTitle, to);
  } catch (error: any) {
    console.log(
      '[worker:push] Error sending notification, will retry or fail',
      to,
      error.toString(),
      JSON.stringify(error)
    );
    throw error;
  }
};
