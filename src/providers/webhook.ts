import fetch from 'node-fetch';
import { capture } from '@snapshot-labs/snapshot-sentry';
import db from '../helpers/mysql';
import { sha256 } from '../helpers/utils';
import { timeOutgoingRequest, outgoingMessages } from '../helpers/metrics';

const HTTP_WEBHOOK_TIMEOUT = 15000;
const serviceEventsSalt = parseInt(process.env.SERVICE_EVENTS_SALT || '12345');

export async function sendEvent(event, to, method = 'POST') {
  event.token = sha256(`${to}${serviceEventsSalt}`);
  event.secret = sha256(`${to}${serviceEventsSalt}`);
  const headerSecret = sha256(`${to}${process.env.SERVICE_EVENTS_SALT}`);
  const url = to.replace('[PROPOSAL-ID]', event.id.split('/')[1]);
  const end = timeOutgoingRequest.startTimer({ method, provider: 'http' });
  let res;

  try {
    res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authentication: headerSecret
      },
      timeout: HTTP_WEBHOOK_TIMEOUT,
      ...(method === 'POST' ? { body: JSON.stringify(event) } : {})
    });

    return true;
  } catch (error: any) {
    if (error.message.includes('network timeout')) {
      console.error('[webhook] request timed out', url);
    } else {
      console.error('[webhook] request error', url, JSON.stringify(error));
    }
    throw error;
  } finally {
    outgoingMessages.inc({
      provider: 'http',
      status: res?.status === 200 ? 1 : 0
    });
    end({ status: res?.status || 0 });
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function send(event, _proposal, _subscribersAddresses) {
  const subscribers = await db.queryAsync(
    'SELECT * FROM subscribers WHERE active = 1'
  );
  console.log('[webhook] subscribers', subscribers.length);

  Promise.allSettled(
    subscribers
      .filter(subscriber => [event.space, '*'].includes(subscriber.space))
      .map(subscriber => sendEvent(event, subscriber.url, subscriber.method))
  )
    .then(() => console.log('[webhook] process event done'))
    .catch(e => capture(e));
}
