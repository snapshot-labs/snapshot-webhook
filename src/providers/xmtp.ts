import { ApiUrls, Client } from '@xmtp/xmtp-js';
import { Wallet } from '@ethersproject/wallet';
import { getSpace } from '../helpers/utils';
import db from '../helpers/mysql';
import { xmtpIncomingMessages, timeOutgoingRequest } from '../helpers/metrics';
import { capture } from '@snapshot-labs/snapshot-sentry';

const XMTP_PK = process.env.XMTP_PK || Wallet.createRandom().privateKey;
const XMTP_ENV = (process.env.XMTP_ENV || 'dev') as keyof typeof ApiUrls;

const wallet: Wallet = new Wallet(XMTP_PK);
let client: Client | undefined = undefined;
let ready = false;

let disabled: string[] = [];

const infoMsg = `👋 Gm,

Snapshot bot here, ready to ping you with fresh proposals.

🔔 Toggle notifications for spaces at https://snapshot.org.
🟢 Say "start" to enable notifications.
🛑 Say "stop" to disable to notifications.
`;

if (XMTP_PK) {
  Client.create(wallet, { env: XMTP_ENV }).then(async c => {
    client = c;

    await client.publishUserContact();
    console.log(`[xmtp] listening on ${c.address}`);

    const rows = await db.queryAsync('SELECT address FROM xmtp WHERE status = 0');

    disabled = rows.map(row => row.address);
    ready = true;

    for await (const message of await client.conversations.streamAllMessages()) {
      try {
        if (message.senderAddress == client.address) continue;
        console.log(`[xmtp] received: ${message.senderAddress}:`, message.content);
        xmtpIncomingMessages.inc();
        const address = message.senderAddress.toLowerCase();

        if (message.content.toLowerCase() === 'stop') {
          await db.queryAsync(
            `INSERT INTO xmtp (address, status) VALUES(?, ?)
            ON DUPLICATE KEY UPDATE address = ?, status = ?;`,
            [address, 0, address, 0]
          );

          disabled.push(address);

          await message.conversation.send(`Got it 🫡, I'll not send you any notifications.`);

          continue;
        }

        if (message.content.toLowerCase() === 'start') {
          await db.queryAsync(
            `INSERT INTO xmtp (address, status) VALUES(?, ?)
            ON DUPLICATE KEY UPDATE address = ?, status = ?;`,
            [address, 1, address, 1]
          );

          disabled = disabled.filter(a => a !== address);

          await message.conversation.send(
            `Got it 🫡, I'll notify you when there is a new proposal.`
          );

          continue;
        }

        await message.conversation.send(infoMsg);
      } catch (e) {
        console.log('[xmtp] error', e, message);
      }
    }
  });
}

export async function send(event, proposal, subscribers) {
  if (!ready || event.event !== 'proposal/start') return;

  const space = await getSpace(event.space);

  if (!space) return;

  let msg = `🟢 New proposal on ${space.name} @${space.id}:\n\n`;
  msg += `${proposal.title}\n`;
  msg += `${proposal.link}?app=xmtp`;

  await sendMessages(subscribers, msg);
}

async function sendMessages(addresses: string[], msg) {
  if (!client) return;

  const canMessage = await client.canMessage(addresses);

  for (let i = 0; i < addresses.length; i++) {
    const peer = addresses[i];

    if (canMessage[i] && !disabled.includes(peer.toLowerCase())) {
      const end = timeOutgoingRequest.startTimer({ provider: 'xmtp' });
      try {
        const conversation = await client.conversations.newConversation(peer);
        await conversation.send(msg);
        end({ status: 200 });
        console.log('[xmtp] sent message to', peer);
      } catch (e: any) {
        capture(e);
        end({ status: 500 });
      }
    }
  }
}
