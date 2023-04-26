import 'dotenv/config';
import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import messagesProcessor from './processors/messages';
import eventsProcessor from './processors/events';
import HttpNotificationsProcessor from './processors/notifications/http';

const connection = new Redis(process.env.REDIS_URL as string);

export const messagesQueue = new Queue('messages', { connection });
export const eventsQueue = new Queue('events', { connection });
export const httpNotificationsQueue = new Queue('notifications-http', {
  connection,
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 10000
    }
  }
});

let messagesWorker: Worker;
let eventsWorker: Worker;
let httpChannelWorker: Worker;

export async function start() {
  console.log('[queue] Starting queue');

  messagesWorker = new Worker(messagesQueue.name, messagesProcessor, { connection });
  eventsWorker = new Worker(eventsQueue.name, eventsProcessor, { connection });
  httpChannelWorker = new Worker(eventsQueue.name, HttpNotificationsProcessor, { connection });

  await messagesQueue.add(
    'messages-reader',
    {},
    {
      repeat: {
        every: 10000
      }
    }
  );

  await eventsQueue.add(
    'events-processor',
    {},
    {
      repeat: {
        every: 15000
      }
    }
  );
}

async function shutdown() {
  console.log('[queue] Starting queue shutdown');
  await Promise.all([messagesWorker.close(), eventsWorker.close(), httpChannelWorker.close()]);
  console.log('[queue] Shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
