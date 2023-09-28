import fetch from 'node-fetch';
import { capture } from '@snapshot-labs/snapshot-sentry';

const WALLETCONNECT_NOTIFY_SERVER_URL = 'https://notify.walletconnect.com';
const WALLETCONNECT_PROJECT_SECRET = process.env.WALLETCONNECT_PROJECT_SECRET;
const WALLETCONNECT_PROJECT_ID = process.env.WALLETCONNECT_PROJECT_ID;

const AUTH_HEADER = {
  Authorization: WALLETCONNECT_PROJECT_SECRET ? `Bearer ${WALLETCONNECT_PROJECT_SECRET}` : ''
};

function getNotificationType(event) {
  if (event.includes('proposal/')) {
    return 'proposal_update';
  } else {
    return null;
  }
}

export async function queryWalletconnectSubscribers() {
  const fetchSubscribersUrl = `${WALLETCONNECT_NOTIFY_SERVER_URL}/${WALLETCONNECT_PROJECT_ID}/subscribers`;

  try {
    const subscribersRs = await fetch(fetchSubscribersUrl, {
      headers: AUTH_HEADER
    });

    const subscribers: string[] = await subscribersRs.json();

    return subscribers;
  } catch (e) {
    capture('[WalletConnect] failed to fetch subscribers');
    return [];
  }
}

export async function crossReferenceSubscribers(internalSubscribers: string[]) {
  const walletconnectSubscribers = await queryWalletconnectSubscribers();
  const crossReferencedSubscribers = new Array(internalSubscribers.length);
  const invalidAddresses = new Array(Math.floor(internalSubscribers.length / 4));

  for (let i = 0; i < internalSubscribers.length; ++i) {
    const sub = internalSubscribers[i];
    if (walletconnectSubscribers.includes(sub)) {
      crossReferencedSubscribers[i] = sub;
    } else {
      invalidAddresses.push(sub);
    }
  }

  if (invalidAddresses.length) {
    capture(
      `[WalletConnect] there are ${invalidAddresses.length} addresses that are not subscribed through WalletConnect`
    );
  }

  // Remove any empty elements
  return crossReferencedSubscribers.filter(e => e);
}

export async function sendNotification(notification, accounts) {
  const notifyUrl = `${WALLETCONNECT_NOTIFY_SERVER_URL}/${WALLETCONNECT_PROJECT_ID}/notify`;

  const body = {
    accounts,
    notification
  };

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

    return notifySuccess;
  } catch (e) {
    capture('[WalletConnect] failed to notify subscribers', e);
  }
}

async function formatMessage(event, proposal) {
  const space = proposal.space;
  if (!space) return null;

  const notificationType = getNotificationType(event.event);

  if (notificationType) {
    capture(`[WalletConnect] could not get matching notification type for event ${event.event}`);
  }

  switch (event.event) {
    case 'proposal/created':
      return {
        title: proposal.title,
        body: `A new proposal has been created for ${space.name}`,
        url: `${proposal.link}?app=walletconnect`,
        icon: space.avatar,
        type: notificationType
      };
    default:
      return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function send(event, proposal, subscribers) {
  const crossReferencedSubscribers = await crossReferenceSubscribers(subscribers);
  const notificationMessage = await formatMessage(event, proposal);
  await sendNotification(notificationMessage, crossReferencedSubscribers);
}
