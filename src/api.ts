import express from 'express';
import { handleCreatedEvent, handleDeletedEvent, sendEvent } from './events';
import { checkAuth, sendError } from './helpers/utils';
import pkg from '../package.json';

const router = express.Router();

router.get('/', async (req, res) => {
  return res.json({
    name: pkg.name,
    version: pkg.version
  });
});

router.get('/test', async (req, res) => {
  const url: any = req.query.url || '';
  const event = {
    id: `proposal/0x38c654c0f81b63ea1839ec3b221fad6ecba474aa0c4e8b4e8bc957f70100e753`,
    space: 'pistachiodao.eth',
    event: 'proposal/created',
    expire: 1647343155
  };
  try {
    new URL(url);
    await sendEvent(event, url);
    return res.json({ url, success: true });
  } catch (e) {
    return res.json({ url, error: e });
  }
});

router.post('/event', checkAuth, async (req, res) => {
  console.log('Received', req.body);
  const event = req.body?.event;
  try {
    if (event === 'proposal/created') {
      await handleCreatedEvent(req.body);
      return res.json({ success: true });
    }
    if (event === 'proposal/deleted') {
      await handleDeletedEvent(req.body);
      return res.json({ success: true });
    }
    console.log('[events] Unknown event', event);
    return sendError(res, 'Unknown event');
  } catch (error) {
    console.log('[events] Error handling event', error);
    return sendError(res, 'Error handling event');
  }
});

export default router;
