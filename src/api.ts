import express from 'express';
import { sendEvent } from './events';
import pkg from '../package.json';
import { getSubscribers, addSubscriber, deactivateSubscriber } from './subscribers';
import { verifySignature } from './helpers/utils';

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

router.get('/subscriptions/:owner', async (req, res) => {
  const { owner } = req.params;
  const subscribers = await getSubscribers(owner);

  return res.json({ subscribers });
});

router.post('/subscribers', async (req, res) => {
  const body: any = req.body;
  await verifySignature(body);
  const params = body.data.message;

  if (params.active === 1) {
    await addSubscriber(params.from, params.url, params.space, params.active, params.timestamp);
  } else {
    await deactivateSubscriber(params.id);
  }

  return res.json({ status: true });
});

export default router;
