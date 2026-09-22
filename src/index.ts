import 'dotenv/config';
import './instrument';
import {
  capture,
  fallbackLogger,
  Sentry
} from '@snapshot-labs/snapshot-sentry';
import bodyParser from 'body-parser';
import cors from 'cors';
import express from 'express';
import api from './api';
import pkg from '../package.json';
import { closeDatabase, runMigrations } from './db';
import { start as startEvents, stop as stopEvents } from './events';
import initMetrics from './helpers/metrics';
import {
  start as startDiscord,
  stop as stopDiscord
} from './providers/discord';
import { last_mci, start as startReplay, stop as stopReplay } from './replay';

const app = express();
const PORT = process.env.PORT || 3000;
const SERVICE_EVENTS = parseInt(process.env.SERVICE_EVENTS || '0');
const SHUTDOWN_TIMEOUT = 25000;

const { stop: stopMetrics } = initMetrics(app);

app.use(bodyParser.json({ limit: '8mb' }));
app.use(bodyParser.urlencoded({ limit: '8mb', extended: false }));
app.use(cors({ maxAge: 86400 }));

app.get('/', async (req, res) => {
  return res.json({
    name: pkg.name,
    version: pkg.version,
    last_mci
  });
});

app.use('/api', api);

fallbackLogger(app);

app.use((_, res) => {
  return res.status(404).json({
    jsonrpc: '2.0',
    error: {
      code: 404,
      message: 'PAGE_NOT_FOUND'
    },
    id: ''
  });
});

let server: ReturnType<typeof app.listen> | undefined;
let shuttingDown = false;
let fatalExitStarted = false;

async function fatal(err: unknown) {
  if (fatalExitStarted) return;
  fatalExitStarted = true;

  console.error(err);
  try {
    capture(err);
    await Sentry.close(2000);
  } finally {
    process.exit(1);
  }
}

const closeServer = () =>
  new Promise<void>((resolve, reject) => {
    if (!server) return resolve();

    server.close(err => {
      if (err) return reject(err);
      console.log('Express server closed.');
      resolve();
    });
  });

async function gracefulShutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;

  const forceExit = setTimeout(
    () => fatal(new Error('Could not shut down in time, forcefully exiting')),
    SHUTDOWN_TIMEOUT
  ).unref();

  console.log(`Received ${signal}. Starting graceful shutdown...`);

  const metricsStopped = stopMetrics();

  try {
    await Promise.all([
      closeServer(),
      stopReplay(),
      stopEvents(),
      metricsStopped
    ]);
    await stopDiscord();

    await closeDatabase();
    clearTimeout(forceExit);
    if (fatalExitStarted) return;
    console.log('Graceful shutdown completed.');
    process.exit(0);
  } catch (err) {
    clearTimeout(forceExit);
    await fatal(err);
  }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

async function start() {
  await runMigrations();

  server = app.listen(PORT, () =>
    console.log(`Listening at http://localhost:${PORT}`)
  );

  startDiscord().catch(fatal);
  startReplay();
  if (SERVICE_EVENTS) startEvents();
}

start().catch(fatal);
