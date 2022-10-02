import express from 'express';
import { sendEvent } from './events';
import pkg from '../package.json';
import {
  isTokenValid,
  sendPushNotification,
  subscribeUser,
  toggleSpaceNotification,
  unsubscribeUser
} from './helpers/firebase';
import { sendError } from './helpers/utils';

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
    id: `proposal/0xc59f05d899cd80178300b724c4bf43a037a908741369690243aa4a77bbafbf18`,
    space: 'fabien.eth',
    event: 'proposal/created',
    expire: 1664272182
  };
  try {
    // new URL(url);
    // await sendEvent(event, url);
    await sendPushNotification(event);
    return res.json({ url, success: true });
  } catch (e) {
    return res.json({ url, error: e });
  }
});

router.post('/device', async (req, res) => {
  const owner = req.body?.owner;
  const token = req.body?.token;
  try {
    // Add token to DB and subscribe user to topics
    await subscribeUser(token, owner);
    return res.json({ success: true });
  } catch (error) {
    console.log('[notifications] Error adding device', error);
    return sendError(res, 'Error enabling push notifications');
  }
});

router.delete('/device', async (req, res) => {
  const owner = req.body?.owner;
  const token = req.body?.token;
  try {
    // Delete token from DB and unsubscribe user from topics
    await unsubscribeUser(token, owner);
    return res.json({ success: true });
  } catch (error) {
    console.log('[notifications] Error deleting device', error);
    return sendError(res, 'Error disabling push notifications');
  }
});

router.post('/subscribed', async (req, res) => {
  const owner = req.body?.owner;
  const token = req.body?.token;
  try {
    // Validate token from DB and subscribe user to topics
    const subscribed = await isTokenValid(token, owner);
    return res.json({ subscribed });
  } catch (error) {
    console.log('[notifications] Error validating device', error);
    return sendError(res, 'Error validating device');
  }
});

router.post('/subscription', async (req, res) => {
  const owner = req.body?.owner;
  const spaceId = req.body?.spaceId;
  const unsubscribe = req.body?.unsubscribe;
  try {
    // Subscribe/unsubscribe user devices when they join/leave space
    await toggleSpaceNotification(owner, spaceId, unsubscribe);
    return res.json({ success: true });
  } catch (error) {
    console.log('[notifications] Error toggling space subscription', error);
    return sendError(res, 'Error toggling space subscription');
  }
});

export default router;
