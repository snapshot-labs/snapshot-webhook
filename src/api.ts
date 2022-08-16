import express from 'express';
import { handleCreatedEvent, handleDeletedEvent } from './events';
import { checkAuth, sendError } from './helpers/utils';
import pkg from '../package.json';

const router = express.Router();

router.get('/', async (req, res) => {
  return res.json({
    name: pkg.name,
    version: pkg.version
  });
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
