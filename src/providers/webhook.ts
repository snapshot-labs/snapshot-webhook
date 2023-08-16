import fetch from 'node-fetch';
import { capture } from '@snapshot-labs/snapshot-sentry';
import db from '../helpers/mysql';
import { sha256 } from '../helpers/utils';
import { timeOutgoingRequest } from '../helpers/metrics';

const HTTP_WEBHOOK_TIMEOUT = 15000;
const serviceEventsSalt = parseInt(process.env.SERVICE_EVENTS_SALT || '12345');

export async function sendEvent(event, to, method = 'POST') {
  event.token = sha256(`${to}${serviceEventsSalt}`);
  event.secret = sha256(`${to}${serviceEventsSalt}`);
  const headerSecret = sha256(`${to}${process.env.SERVICE_EVENTS_SALT}`);
  const url = to.replace('[PROPOSAL-ID]', event.id.split('/')[1]);
  const end = timeOutgoingRequest.startTimer({ method });
  let res;

  try {
    res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authentication: headerSecret
      },
      body: JSON.stringify(event),
      timeout: HTTP_WEBHOOK_TIMEOUT
    });
    return res.text();
  } catch (error: any) {
    if (error.message.includes('network timeout')) {
      console.error('[events] Timed out while sending the webhook', url);
    } else {
      console.error('[events] Error sending event data to webhook', url, JSON.stringify(error));
    }
    throw error;
  } finally {
    end({ status: res?.statusCode || 0 });
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function send(event, _proposal, _subscribersAddresses) {
  const subscribers = await db.queryAsync('SELECT * FROM subscribers');
  console.log('[events] Subscribers', subscribers.length);

  Promise.allSettled(
    subscribers
      .filter(subscriber => [event.space, '*'].includes(subscriber.space))
      .map(subscriber => sendEvent(event, subscriber.url, subscriber.method))
  )
    .then(() => console.log('[events] Process event done'))
    .catch(e => capture(e));
}
