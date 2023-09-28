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

  const proposal = {
    id: '0x45121903be7c520701d8d5536d2de29577367f2c84f39602026dc09ef1da8346',
    title: 'Proposal to Redirect Multichain Warchest to CAKE Burn',
    start: 1695376800,
    end: 1695463200,
    state: 'closed',
    space: {
      id: 'cakevote.eth',
      name: 'PancakeSwap',
      avatar: 'ipfs://bafkreidd4kzjvr5hfbcazj5jqpvd5vz2lj467uhl2i3ejdllafnlx4itcy'
    }
  };

  try {
    new URL(url);
    await send(event, proposal, ['caip 10 address']);

    return res.json({ url, success: true });
  } catch (e: any) {
    if (e.code !== 'ERR_INVALID_URL') {
      capture(e);
    }

    return res.json({ url, error: e });
  }
});

export default router;
