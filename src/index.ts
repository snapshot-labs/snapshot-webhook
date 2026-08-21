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
import { start as startEvents } from './events';
import initMetrics from './helpers/metrics';
import { last_mci, run } from './replay';

const app = express();
const PORT = process.env.PORT || 3000;

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

async function start() {
  await runMigrations();
  run();
  startEvents();
  const server = app.listen(PORT, () =>
    console.log(`Listening at http://localhost:${PORT}`)
  );

  const gracefulShutdown = (signal: string) => {
    console.log(`Received ${signal}. Starting graceful shutdown...`);

    server.close(async () => {
      console.log('Express server closed.');

      try {
        stopMetrics();
        await closeDatabase();
        console.log('Graceful shutdown completed.');
        process.exit(0);
      } catch (err) {
        console.error('Error during shutdown:', err);
        process.exit(1);
      }
    });
  };

  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
}

start().catch(async err => {
  console.error('Failed to start', err);
  capture(err);
  await Sentry.close(2000);
  process.exit(1);
});
