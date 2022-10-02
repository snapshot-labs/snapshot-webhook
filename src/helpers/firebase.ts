import snapshot from '@snapshot-labs/snapshot.js';
import { initializeApp, cert, ServiceAccount } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

import db from './mysql';
import { getProposal } from './proposal';

import serviceAccount from '../../firebase.json';

const firebaseApp = initializeApp({
  credential: cert(serviceAccount as ServiceAccount)
});
const messaging = getMessaging(firebaseApp);
const hubURL = process.env.HUB_URL || 'https://hub.snapshot.org';

const getUserSpaces = async user => {
  let userSpaces: { [key: string]: any } = [];
  const query = {
    follows: {
      __args: {
        where: { follower: user }
      },
      space: { id: true }
    }
  };
  try {
    const result = await snapshot.utils.subgraphRequest(`${hubURL}/graphql`, query);
    userSpaces = result.follows || [];
  } catch (error) {
    console.log('[notifications] Snapshot hub error:', error);
  }
  return userSpaces.map(follow => follow.space.id);
};

const toggleTopicSubscription = async (token, owner, space, unsubscribe) => {
  try {
    if (unsubscribe) {
      await messaging.unsubscribeFromTopic(token, space);
    } else {
      await messaging.subscribeToTopic(token, space);
    }

    console.log(
      `[notifications] Successfully ${
        unsubscribe ? 'un' : ''
      }subscribed user: ${owner} to space: ${space}`
    );
  } catch (e) {
    console.error(
      `[notifications] Error ${unsubscribe ? 'un' : ''}subscribing user ${owner} to space ${space}`,
      e
    );
  }
};

export const isTokenValid = async (token, owner) => {
  // TODO: Check token validity in Firebase
  const device = await db.queryAsync(
    'SELECT * FROM device_tokens WHERE token = ? AND owner = ? LIMIT 1',
    [token, owner]
  );
  return Boolean(device.length);
};

export const sendPushNotification = async event => {
  const proposal = await getProposal(event.id.replace('proposal/', ''));
  if (!proposal) {
    console.log('[notifications] Proposal not found', event.id);
    return;
  }

  messaging
    .sendToTopic(event.space, {
      notification: {
        title: event.space,
        body: proposal.title,
        clickAction: `${process.env.SNAPSHOT_URI}/#/${event.space}/${event.id}`
      }
    })
    .then(response => {
      console.log('Notification sent successfully!', response.messageId);
    })
    .catch(error => console.error(error.errorInfo.code));
};

export const subscribeUser = async (token, owner) => {
  try {
    const ts = parseInt((Date.now() / 1e3).toFixed());
    await db.queryAsync(
      `INSERT INTO device_tokens (token, owner, created, updated) VALUES (?, ?, ?, ?)`,
      [token, owner, ts, ts]
    );

    const userSpaces = await getUserSpaces(owner);
    userSpaces.map(async space => toggleTopicSubscription(token, owner, space, false));
  } catch (e) {
    console.error('[notifications] subscribeUser:', e);
  }
};

export const unsubscribeUser = async (token, owner) => {
  try {
    await db.queryAsync('DELETE FROM device_tokens WHERE token = ? AND owner = ? LIMIT 1', [
      token,
      owner
    ]);

    const userSpaces = await getUserSpaces(owner);
    userSpaces.map(async space => toggleTopicSubscription(token, owner, space, true));
  } catch (e) {
    console.error('[notifications] unsubscribeUser:', e);
  }
};

export const toggleSpaceNotification = async (owner, spaceId, unsubscribe) => {
  try {
    const deviceTokens = await db.queryAsync(`SELECT token FROM device_tokens WHERE owner = ?`, [
      owner
    ]);

    if (deviceTokens.length !== 0) {
      deviceTokens.map(async deviceToken =>
        toggleTopicSubscription(deviceToken.token, owner, spaceId, unsubscribe)
      );
    }
  } catch (e) {
    console.error('[notifications] toggleSpaceNotification:', e);
  }
};
