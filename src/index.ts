import 'dotenv/config';
import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import { initLogger, fallbackLogger } from '@snapshot-labs/snapshot-sentry';
import initMetrics from './helpers/metrics';
import api from './api';
import pkg from '../package.json';
import { last_mci, run } from './replay';

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

app.listen(PORT, () => console.log(`Listening at http://localhost:${PORT}`));
