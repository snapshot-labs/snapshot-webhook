import { capture } from '@snapshot-labs/snapshot-sentry';
import snapshot from '@snapshot-labs/snapshot.js';
import { outgoingMessages, timeOutgoingRequest } from '../helpers/metrics';
import db from '../helpers/mysql';
import { sha256 } from '../helpers/utils';

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
    res = await snapshot.utils.fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authentication: headerSecret
      },
      timeout: HTTP_WEBHOOK_TIMEOUT,
      ...(method === 'POST' ? { body: JSON.stringify(event) } : {})
    });

    return true;
  } catch (err: any) {
    if (err.message.includes('network timeout')) {
      console.error('[webhook] request timed out', url);
    } else {
      console.error('[webhook] request error', url, JSON.stringify(err));
    }
    throw err;
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
  // The indexed SQL predicate narrows 'every active row' down to a small
  // candidate set, but it matches under the column collation
  // (utf8mb4_general_ci: case-insensitive, accent-insensitive, PAD SPACE), so
  // it can also return rows whose space is not byte-identical to the event's
  // -- 'FOO.ETH', 'fóo.eth' and 'foo.eth ' all match an event for 'foo.eth'.
  // Re-apply the exact JS comparison to the candidates so the set we actually
  // send to stays identical to a plain equality filter. Collating the column
  // in SQL instead would defeat the index this query relies on.
  const candidates = await db.queryAsync(
    'SELECT space, url, method FROM subscribers WHERE active = 1 AND space IN (?)',
    [[event.space, '*']]
  );
  const subscribers = candidates.filter(subscriber =>
    [event.space, '*'].includes(subscriber.space)
  );
  console.log('[webhook] subscribers for', event.space, subscribers.length);

  Promise.allSettled(
    subscribers.map(subscriber =>
      sendEvent(event, subscriber.url, subscriber.method)
    )
  )
    .then(() => console.log('[webhook] process event done'))
    .catch(e => capture(e));
}
