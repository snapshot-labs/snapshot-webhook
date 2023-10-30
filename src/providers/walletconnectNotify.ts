import fetch from 'node-fetch';
import { capture } from '@snapshot-labs/snapshot-sentry';

const WALLETCONNECT_NOTIFY_SERVER_URL = process.env.WALLETCONNECT_NOTIFY_SERVER_URL;
const WALLETCONNECT_PROJECT_SECRET = process.env.WALLETCONNECT_PROJECT_SECRET;
const WALLETCONNECT_PROJECT_ID = process.env.WALLETCONNECT_PROJECT_ID;

const AUTH_HEADER = {
  Authorization: WALLETCONNECT_PROJECT_SECRET ? `Bearer ${WALLETCONNECT_PROJECT_SECRET}` : ''
};

// Match Snapshot event names to notification types
// That should be defined in the wc-notify-config.json
function getNotificationType(event) {
  if (event.includes('proposal/')) {
    return 'ed2fd071-65e1-440d-95c5-7d58884eae43';
  } else {
    return null;
  }
}

function getNotificationBody(event, space) {
  switch(event) {
  case "proposal/create":
    return `A new proposal has been created for ${space.name}`
  case "proposal/end":
    return `A proposal has closed for ${space.name}`
  default:
    return null;
  }
}

// Fetch subscribers from WalletConnect Notify server
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

// Cross Reference subscribers from Snapshot to the ones in Notify
export async function crossReferenceSubscribers(internalSubscribers: string[]) {
  const walletconnectSubscribers = await queryWalletconnectSubscribers();
  // Optimistically reserve space in the cross referenced array to prevent resizing.
  const crossReferencedSubscribers = new Array(internalSubscribers.length);
  const invalidAddresses = new Array<string>(0);

  for (let i = 0; i < internalSubscribers.length; ++i) {
    const sub = internalSubscribers[i];
    if (walletconnectSubscribers.includes(sub)) {
      crossReferencedSubscribers[i] = sub;
    } else {
      // If a subscriber is registered internally, but not in WalletConnect, it is an invalid
      // subscription
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

// Transform proposal event into notification format.
async function formatMessage(event, proposal) {
  const space = proposal.space;
  if (!space) return null;

  const notificationType = getNotificationType(event.event);
  const notificationBody = getNotificationBody(event.event, space);

  if (!notificationType) {
    capture(`[WalletConnect] could not get matching notification type for event ${event.event}`);
    return;
  }

  if(!notificationBody) {
    capture(`[WalletConnect] could not get matching notification body for event ${event.event}`);
    return;
  }

  return {
    title: proposal.title,
    body: notificationBody,
    url: `${proposal.link}?app=walletconnect`,
    icon: space.avatar,
    type: notificationType
  };
}

export async function send(event, proposal, subscribers) {
  const crossReferencedSubscribers = await crossReferenceSubscribers(subscribers);
  const notificationMessage = await formatMessage(event, proposal);
  await sendNotification(notificationMessage, crossReferencedSubscribers);
}
