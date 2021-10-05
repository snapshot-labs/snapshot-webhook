import db from './mysql';

export let subs = {};

export async function loadSubscriptions() {
  const results = await db.queryAsync('SELECT * FROM subscriptions');
  subs = {};
  results.forEach(sub => {
    if (!subs[sub.space]) subs[sub.space] = [];
    subs[sub.space].push(sub);
  });
  console.log('Subscriptions', subs);
}
