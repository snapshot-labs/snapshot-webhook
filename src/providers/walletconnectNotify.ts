import fetch from 'node-fetch';
import snapshot from '@snapshot-labs/snapshot.js';
import { capture } from '@snapshot-labs/snapshot-sentry';
import { timeOutgoingRequest, outgoingMessages } from '../helpers/metrics';
import type { Event } from '../types';

const WALLETCONNECT_NOTIFY_SERVER_URL =
  process.env.WALLETCONNECT_NOTIFY_SERVER_URL;
const WALLETCONNECT_PROJECT_SECRET = process.env.WALLETCONNECT_PROJECT_SECRET;
const WALLETCONNECT_PROJECT_ID = process.env.WALLETCONNECT_PROJECT_ID;
const WALLETCONNECT_NOTIFICATION_TYPE =
  process.env.WALLETCONNECT_NOTIFICATION_TYPE;

const AUTH_HEADER = {
  Authorization: WALLETCONNECT_PROJECT_SECRET
    ? `Bearer ${WALLETCONNECT_PROJECT_SECRET}`
    : ''
};

// Rate limiting numbers:
const MAX_ACCOUNTS_PER_REQUEST = 500;
const PER_SECOND_RATE_LIMIT = 2;
const WAIT_ERROR_MARGIN = 0.25;
const WAIT_TIME = 1 / PER_SECOND_RATE_LIMIT + WAIT_ERROR_MARGIN;
const isConfigured =
  WALLETCONNECT_NOTIFY_SERVER_URL &&
  WALLETCONNECT_PROJECT_SECRET &&
  WALLETCONNECT_PROJECT_ID &&
  WALLETCONNECT_NOTIFICATION_TYPE;

async function queueNotificationsToSend(notification, accounts: string[]) {
  for (let i = 0; i < accounts.length; i += MAX_ACCOUNTS_PER_REQUEST) {
    await sendNotification(
      notification,
      accounts.slice(i, i + MAX_ACCOUNTS_PER_REQUEST)
    );

    await snapshot.utils.sleep(WAIT_TIME);
  }
}

export async function sendNotification(notification, accounts: string[]) {
  const notifyUrl = `${WALLETCONNECT_NOTIFY_SERVER_URL}/${WALLETCONNECT_PROJECT_ID}/notify`;

  const body = {
    accounts,
    notification
  };

  const end = timeOutgoingRequest.startTimer({ provider: 'walletconnect' });
  let success = false;

  try {
    const notifyRs = await fetch(notifyUrl, {
      method: 'POST',
      headers: {
        ...AUTH_HEADER,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    const notifySuccess = await notifyRs.json();
    if (notifySuccess?.error) {
      throw new Error(notifySuccess.error);
    }
    success = true;
    return notifySuccess;
  } catch (e) {
    capture(e);
    console.log('[WalletConnect] failed to notify subscribers', e);
  } finally {
    outgoingMessages.inc(
      { provider: 'walletconnect', status: success ? 1 : 0 },
      accounts.length
    );
    end({ status: success ? 200 : 500 });
  }
}

// Transform proposal event into notification format.
function formatMessage(event: Event, proposal) {
  const space = proposal.space;
  if (!space) return null;

  const notificationType = WALLETCONNECT_NOTIFICATION_TYPE;
  const notificationBody = `🟢 New proposal on ${space.name} @${space.id}\n\n`;

  const url = `${proposal.link}?app=web3inbox`;
  return {
    title: proposal.title,
    body: notificationBody,
    url,
    type: notificationType
  };
}

export async function send(event: Event, proposal, addresses: string[]) {
  if (!isConfigured) {
    return console.log('[WalletConnect] Sending skipped: client not setup');
  }
  if (event.event !== 'proposal/start') return;
  const notificationMessage = formatMessage(event, proposal);

  const accounts = addresses.map(address => `eip155:1:${address}`);

  await queueNotificationsToSend(notificationMessage, accounts);
}
