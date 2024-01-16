import fetch from 'node-fetch';
import { capture } from '@snapshot-labs/snapshot-sentry';

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

// Rate limiting logic:
async function wait(seconds: number) {
  return new Promise<void>(resolve => {
    setTimeout(resolve, seconds * 1_000);
  });
}

// Fetch subscribers from WalletConnect Notify server
export async function getSubscribersFromWalletConnect() {
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

// Find the CAIP10 of subscribers, since the Notify API requires CAIP10.
async function crossReferenceSubscribers(
  space: { id: string },
  spaceSubscribers
) {
  const subscribersFromDb = spaceSubscribers;
  const subscribersFromWalletConnect = await getSubscribersFromWalletConnect();

  // optimistically reserve all subscribers from the db
  const crossReferencedSubscribers = new Array(subscribersFromDb.length);

  // Create a hashmap for faster lookup
  const addressPrefixMap = new Map<string, string>();
  for (const subscriber of subscribersFromWalletConnect) {
    const unprefixedAddress = subscriber.split(':').pop();
    if (unprefixedAddress) {
      addressPrefixMap.set(unprefixedAddress, subscriber);
    }
  }

  for (const subscriber of subscribersFromDb) {
    const crossReferencedAddress = addressPrefixMap.get(subscriber);
    if (crossReferencedAddress) {
      crossReferencedSubscribers.push(crossReferencedAddress);
    }
  }

  // remove empty elements from the array, since some might not have been found in WalletConnect Notify server
  return crossReferencedSubscribers.filter(addresses => addresses);
}

async function queueNotificationsToSend(notification, accounts: string[]) {
  for (let i = 0; i < accounts.length; i += MAX_ACCOUNTS_PER_REQUEST) {
    await sendNotification(
      notification,
      accounts.slice(i, i + MAX_ACCOUNTS_PER_REQUEST)
    );
    const waitTime = 1 / PER_SECOND_RATE_LIMIT + WAIT_ERROR_MARGIN;
    await wait(waitTime);
  }
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
function formatMessage(event, proposal) {
  const space = proposal.space;
  if (!space) return null;

  const notificationType = WALLETCONNECT_NOTIFICATION_TYPE;
  const notificationBody = `🟢 New proposal on ${space.name} @${space.id}\n\n`;

  const url = `${proposal.link}?app=web3inbox`;
  return {
    title: proposal.title,
    body: notificationBody,
    url,
    icon: space.avatar,
    type: notificationType
  };
}

export async function send(event, proposal, subscribers) {
  if (event.event !== 'proposal/start') return;
  const crossReferencedSubscribers = await crossReferenceSubscribers(
    proposal.space,
    subscribers
  );
  const notificationMessage = formatMessage(event, proposal);

  await queueNotificationsToSend(
    notificationMessage,
    crossReferencedSubscribers
  );
}
