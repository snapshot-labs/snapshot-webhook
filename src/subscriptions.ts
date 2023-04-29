import db from './helpers/mysql';
import type { Subscription } from './types';

export let subs: Record<Subscription['space'], Subscription[]> = {};

export async function loadSubscriptions() {
  const results = await db.queryAsync('SELECT * FROM subscriptions');
  subs = {};
  results.forEach(sub => {
    if (!subs[sub.space as string]) subs[sub.space as string] = [];
    subs[sub.space as string].push(sub as Subscription);
  });
  console.log('Subscriptions', Object.keys(subs).length);
}
