import { ApiUrls, Client } from '@xmtp/xmtp-js';
import { Wallet } from '@ethersproject/wallet';
import { getSpace } from '../helpers/utils';

const XMTP_PK = process.env.XMTP_PK || Wallet.createRandom().privateKey;
const XMTP_ENV = (process.env.XMTP_ENV || 'dev') as keyof typeof ApiUrls;

const wallet: Wallet = new Wallet(XMTP_PK);
let client: Client | undefined = undefined;
let ready = false;

if (XMTP_PK) {
  Client.create(wallet, { env: XMTP_ENV }).then(async c => {
    client = c;

    await client.publishUserContact();
    console.log(`[xmtp] listening on ${c.address}`);

    ready = true;
  });
}

export async function send(event, proposal, subscribers) {
  if (!ready || event.event !== 'proposal/start') return;

  const space = await getSpace(event.space);

  if (!space) return;

  const msg = `${space.name} proposal "${proposal.title}" is ready to vote on ${proposal.link}.`;

  await sendMessages(subscribers, msg);
}

async function sendMessages(addresses: string[], msg) {
  if (!client) return;

  const canMessage = await client.canMessage(addresses);

  for (let i = 0; i < addresses.length; i++) {
    const peer = addresses[i];

    if (canMessage[i]) {
      const conversation = await client.conversations.newConversation(peer);
      const sent = await conversation.send(msg);
      console.log('[xmtp] sent', sent, 'to', peer);
    }
  }
}
