import { capture } from '@snapshot-labs/snapshot-sentry';
import snapshot from '@snapshot-labs/snapshot.js';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db';
import { outgoingMessages, timeOutgoingRequest } from '../helpers/metrics';
import { sha256 } from '../helpers/utils';
import { subscribers } from '../schema';

const HTTP_WEBHOOK_TIMEOUT = 15000;
const serviceEventsSalt = process.env.SERVICE_EVENTS_SALT || '12345';

export async function sendEvent(event, to, method = 'POST') {
  const secret = sha256(`${to}${serviceEventsSalt}`);
  event.token = secret;
  event.secret = secret;
  const url = to.replace('[PROPOSAL-ID]', event.id.split('/')[1]);
  const end = timeOutgoingRequest.startTimer({ method, provider: 'http' });
  let res;

  try {
    res = await snapshot.utils.fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authentication: secret
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
  // Postgres text equality is byte-exact (no collation folding), so the SQL
  // predicate alone matches exactly — no JS re-filter needed.
  const activeSubscribers = await db.query.subscribers.findMany({
    columns: { url: true, method: true },
    where: and(
      eq(subscribers.active, true),
      inArray(subscribers.space, [event.space, '*'])
    )
  });
  console.log(
    '[webhook] subscribers for',
    event.space,
    activeSubscribers.length
  );

  await Promise.allSettled(
    activeSubscribers.map(subscriber =>
      sendEvent(event, subscriber.url, subscriber.method)
    )
  )
    .then(() => console.log('[webhook] process event done'))
    .catch(e => capture(e));
}
