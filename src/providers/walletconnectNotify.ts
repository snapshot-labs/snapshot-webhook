import fetch from 'node-fetch';
import { capture } from '@snapshot-labs/snapshot-sentry';
import db from '../helpers/mysql';
import { getSpace, getProposal } from '../helpers/utils';

const WALLETCONNECT_NOTIFY_SERVER_URL = 'https://notify.walletconnect.com';
const WALLETCONNECT_PROJECT_SECRET = process.env.WALLETCONNECT_PROJECT_SECRET;
const WALLETCONNECT_PROJECT_ID = process.env.WALLETCONNECT_PROJECT_ID;

const AUTH_HEADER = {
  Authorization: WALLETCONNECT_PROJECT_SECRET ?? ''
};

export async function queryWalletconnectSubscribers() {
  const fetchSubscribersUrl = `${WALLETCONNECT_NOTIFY_SERVER_URL}/${WALLETCONNECT_PROJECT_ID}/subscribers`;

  try {
    const subscribersRs = await fetch(fetchSubscribersUrl, {
      headers: AUTH_HEADER
    });

    const subscribers: string[] = await subscribersRs.json();

    return subscribers;
  } catch (e) {
    console.error('[WalletConnect] Failed to fetch subscribers');
    return [];
  }
}

export async function crossReferencesSubscribers(internalSubscribers: string[]) {
  const walletconnectSubscribers = await queryWalletconnectSubscribers();
  const crossReferencedSubscribers = new Array(internalSubscribers.length);
  const invalidAddresses = new Array(internalSubscribers.length / 4);

  for (const internalSubscriber of internalSubscribers) {
    if (walletconnectSubscribers.includes(internalSubscriber)) {
      crossReferencedSubscribers.push(walletconnectSubscribers);
    } else {
      invalidAddresses.push(internalSubscriber);
    }
  }

  if (invalidAddresses.length) {
    const err = `[WalletConnect] there are ${invalidAddresses.length} addresses that are not subscribed through WalletConnect`;
    capture(err);
  }

  return crossReferencesSubscribers;
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
    capture('[WalletConnect] Failed to notify subscribers', e);
  }
}

async function formatMessage(event, proposal) {
  const space = await getSpace(event.space);
  if (!space) return null;

  switch (event.event) {
    case 'proposal/created':
      return {
        title: proposal.title,
        body: `A new proposal has been created for ${space.name}`,
        url: `${proposal.link}?app=walletconnect`,
        icon: ``,
        type: 'proposal_update'
      };
    default:
      return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function send(event, proposal, subscribers) {
  const crossReferencedSubscribers = await crossReferencesSubscribers(subscribers);
  const notificationMessage = await formatMessage(event, proposal);
  await sendNotification(notificationMessage, crossReferencedSubscribers);
}
