import 'dotenv/config';
import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import { initLogger, fallbackLogger } from '@snapshot-labs/snapshot-sentry';
import initMetrics from './helpers/metrics';
import api from './api';
import pkg from '../package.json';
import { last_mci, run } from './replay';
import { closeDatabase } from './helpers/mysql';

const app = express();
const PORT = process.env.PORT || 3000;

initLogger(app);
initMetrics(app);

run();

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

const server = app.listen(PORT, () =>
  console.log(`Listening at http://localhost:${PORT}`)
);

const gracefulShutdown = async (signal: string) => {
  console.log(`Received ${signal}. Starting graceful shutdown...`);

  server.close(async () => {
    console.log('Express server closed.');

    try {
      await closeDatabase();
      console.log('Graceful shutdown completed.');
      process.exit(0);
    } catch (error) {
      console.error('Error during shutdown:', error);
      process.exit(1);
    }
  });
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
