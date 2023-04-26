import type { Job } from 'bullmq';
import { sendPushNotification } from '../../../helpers/beams';

export default async (job: Job) => {
  const { event, to, proposalTitle } = job.data;

  sendPushNotification(event, proposalTitle, to);
};
