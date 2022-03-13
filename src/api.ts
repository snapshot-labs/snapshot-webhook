import express from 'express';
import { createHash } from 'crypto';
import { handleDiscordMessages } from './discord';
import pkg from '../package.json';
import { handleCreatedEvent, handleDeletedEvent } from './events';
import { sendError } from './utils';
import './events';

function sha256(str) {
  return createHash('sha256')
    .update(str)
    .digest('hex');
}

const checkAuth = (req, res, next) => {
  const secret = req.body?.secret || '0';
  if (sha256(secret) !== '72a17dc82d2384b0753e3d090c7db89e1d15c1f1c51188a7aafb91382a5e73c0') {
    console.log('Wrong secret');
    return sendError(res, 'Wrong secret');
  }
  next();
};

const router = express.Router();

router.get('/', async (req, res) => {
  return res.json({
    name: pkg.name,
    version: pkg.version
  });
});

router.all('/webhook', checkAuth, async (req, res) => {
  console.log('Received', req.body);
  const proposalId = req.body?.id?.replace('proposal/', '') || 'Qmemba2wh7dUiWq62447X7mpXmQ34di1Eym3N7vE7V7WsN';
  const event = req.body?.event || 'proposal/start';
  const response = handleDiscordMessages(event, proposalId);
  return res.json(response);
});

router.post('/event', checkAuth, async (req, res) => {
  console.log('Received', req.body);
  const event = req.body?.event;
  const eventName = event?.event;
  try {
    if (eventName === 'proposal/created') {
      await handleCreatedEvent(event);
      return res.json({ success: true });
    }
    if (eventName === 'proposal/deleted') {
      await handleDeletedEvent(event);
      return res.json({ success: true });
    }
    return sendError(res, 'Unknown event');
  } catch (error) {
    console.log('[events] Error handling event', error);
    return sendError(res, 'Error handling event');
  }
});

export default router;
