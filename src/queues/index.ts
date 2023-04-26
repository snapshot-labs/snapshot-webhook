import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import replayProcessor from './processors/replay';
import eventsProcessor from './processors/events';
import HttpNotificationsProcessor from './processors/notifications/http';
import PushNotificationsProcessor from './processors/notifications/push';
import DiscordNotificationsProcessor from './processors/notifications/discord';

const connection = new Redis(process.env.REDIS_URL as string, { maxRetriesPerRequest: null });

export const replayQueue = new Queue('replay', { connection });
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
export const pushNotificationsQueue = new Queue('notifications-push', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 10000
    }
  }
});
export const discordNotificationsQueue = new Queue('notifications-discord', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 10000
    }
  }
});

let replayWorker: Worker;
let eventsWorker: Worker;
let httpChannelWorker: Worker;
let pushChannelWorker: Worker;
let discordChannelWorker: Worker;

export async function start() {
  console.log('[queue] Starting queue');

  replayWorker = new Worker(replayQueue.name, replayProcessor, { connection });
  eventsWorker = new Worker(eventsQueue.name, eventsProcessor, { connection });
  httpChannelWorker = new Worker(httpNotificationsQueue.name, HttpNotificationsProcessor, {
    connection
  });
  pushChannelWorker = new Worker(pushNotificationsQueue.name, PushNotificationsProcessor, {
    connection
  });
  discordChannelWorker = new Worker(discordNotificationsQueue.name, DiscordNotificationsProcessor, {
    connection
  });

  await replayQueue.add(
    'replay',
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
  await Promise.all([
    replayWorker.close(),
    eventsWorker.close(),
    httpChannelWorker.close(),
    pushChannelWorker.close(),
    discordChannelWorker.close()
  ]);
  console.log('[queue] Shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
