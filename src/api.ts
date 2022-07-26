import { handleCreatedEvent, handleDeletedEvent } from './events/index';
import { checkAuth, sendError } from './utils';
import { sendEventToDiscordSubscribers } from './discord';
import express from 'express';
import pkg from '../package.json';

const router = express.Router();

router.get('/', async (req, res) => {
  return res.json({
    name: pkg.name,
    version: pkg.version
  });
});

// TODO: Once hub changes are merged, remove this endpoint
router.post('/webhook', checkAuth, async (req, res) => {
  console.log('Received', JSON.stringify(req.body));
  const proposalId = req.body?.id?.replace('proposal/', '') || '';
  const event = req.body?.event || 'proposal/start';

  const response = sendEventToDiscordSubscribers(event, proposalId);
  return res.json(response);
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
