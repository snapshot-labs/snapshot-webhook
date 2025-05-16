import { ApiUrls, Client } from '@xmtp/xmtp-js';
import { Wallet } from '@ethersproject/wallet';
import db from '../helpers/mysql';
import {
  xmtpIncomingMessages,
  timeOutgoingRequest,
  outgoingMessages
} from '../helpers/metrics';
import { capture } from '@snapshot-labs/snapshot-sentry';
import { Event } from '../types';

const XMTP_PK = process.env.XMTP_PK || Wallet.createRandom().privateKey;
const XMTP_ENV = (process.env.XMTP_ENV || 'dev') as keyof typeof ApiUrls;

const wallet: Wallet = new Wallet(XMTP_PK);
let client: Client | undefined = undefined;
let ready = false;

const disabled = new Set<string>();

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

    const disabledPeers = await db.queryAsync(
      'SELECT address FROM xmtp WHERE status = 0'
    );

    for (const peer of disabledPeers) {
      disabled.add(peer.address);
    }
    ready = true;

    for await (const message of await client.conversations.streamAllMessages()) {
      try {
        if (message.senderAddress == client.address) continue;
        console.log(
          `[xmtp] received: ${message.senderAddress}:`,
          message.content
        );
        xmtpIncomingMessages.inc();
        const address = message.senderAddress.toLowerCase();

        if (message.content.toLowerCase() === 'stop') {
          await db.queryAsync(
            `INSERT INTO xmtp (address, status) VALUES(?, ?)
            ON DUPLICATE KEY UPDATE address = ?, status = ?;`,
            [address, 0, address, 0]
          );

          disabled.add(address.toLowerCase());

          await message.conversation.send(
            `Got it 🫡, I'll not send you any notifications.`
          );

          continue;
        }

        if (message.content.toLowerCase() === 'start') {
          await db.queryAsync(
            `INSERT INTO xmtp (address, status) VALUES(?, ?)
            ON DUPLICATE KEY UPDATE address = ?, status = ?;`,
            [address, 1, address, 1]
          );

          disabled.delete(address.toLowerCase());

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

export async function send(event: Event, proposal, subscribers: string[]) {
  if (!ready || event.event !== 'proposal/start') return;

  let msg = `🟢 New proposal on ${proposal.space.name} @${proposal.space.id}:\n\n`;
  msg += `${proposal.title}\n`;
  msg += `${proposal.link}?app=xmtp`;

  await sendMessages(subscribers, msg);
}

async function sendMessages(addresses: string[], msg: string) {
  if (!client) return;

  const canMessage = await client.canMessage(addresses);
  const validAddresses = addresses.filter(
    (address, i) => canMessage[i] && !disabled.has(address.toLowerCase())
  );

  const sendPromises = validAddresses.map(async address => {
    const end = timeOutgoingRequest.startTimer({ provider: 'xmtp' });
    try {
      const conversation = await client!.conversations.newConversation(address);
      await conversation.send(msg);
      end({ status: 200 });
      outgoingMessages.inc({ provider: 'xmtp', status: 1 });
      console.log('[xmtp] sent message to', address);
    } catch (e: any) {
      capture(e);
      outgoingMessages.inc({ provider: 'xmtp', status: 0 });
      end({ status: 500 });
    }
  });

  await Promise.allSettled(sendPromises);
}
