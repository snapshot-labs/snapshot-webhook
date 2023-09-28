import express from 'express';
import { send } from './providers/walletconnectNotify';
import { capture } from '@snapshot-labs/snapshot-sentry';

const router = express.Router();

router.get('/test', async (req, res) => {
  const url: any = req.query.url || '';
  const method: string = (req.query.method as string) ?? 'POST';
  const event = {
    id: `proposal/0x38c654c0f81b63ea1839ec3b221fad6ecba474aa0c4e8b4e8bc957f70100e753`,
    space: 'pistachiodao.eth',
    event: 'proposal/created',
    expire: 1647343155
  };

  try {
    new URL(url);
    await send(event, url, method);

    return res.json({ url, success: true });
  } catch (e: any) {
    if (e.code !== 'ERR_INVALID_URL') {
      capture(e);
    }

    return res.json({ url, error: e });
  }
});

export default router;
