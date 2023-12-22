import fetch from 'node-fetch';
import { capture } from '@snapshot-labs/snapshot-sentry';
import { getSubscribers } from '../helpers/utils';

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

// Cross Reference subscribers from Snapshot to the ones in Notify
export async function getSubscriberFromDb(space: string) {
  const subs: string[] = await getSubscribers(space);
  return subs;
}

// Find the CAIP10 of subscribers, since the Notify API requires CAIP10.
async function crossReferenceSubscribers(space: { id: string }) {
  const subscribersFromDb = await getSubscriberFromDb(space.id);
  const subscribersFromWalletConnect = await getSubscribersFromWalletConnect();

  // optimistically reserve all subscribers from the db
  const crossReferencedSubscribers = new Array(subscribersFromDb.length);

  // Create a hashmap for faster lookup
  const addressPrefixMap = new Map<string, string>();
  for(const subscriber of subscribersFromWalletConnect) {
    const unprefixedAddress = subscriber.split(':').pop();
    if(unprefixedAddress) {
      addressPrefixMap.set(unprefixedAddress, subscriber)
    }
  }

  for(const subscriber of subscribersFromDb) {
    // using `includes` since the addresses in notify server are CAIP10 (I.E eip155:1:0x...)
    const crossReferencedAddress = addressPrefixMap.get(subscriber);
    if(crossReferencedAddress) {
      crossReferencedSubscribers.push(crossReferencedAddress)
    }
  }

  // remove empty elements from the array, since some might not have been found in WalletConnect Notify server
  return crossReferencedSubscribers.filter(addresses => addresses);
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

export async function send(event, proposal, _subscribers) {
  
  const crossReferencedSubscribers = await crossReferenceSubscribers(proposal.space);
  const notificationMessage = await formatMessage(event, proposal);

  await sendNotification(notificationMessage, crossReferencedSubscribers);
}
