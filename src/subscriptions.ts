import db from './helpers/mysql';

export let subs = {};

export async function loadSubscriptions() {
  const results = await db.queryAsync('SELECT * FROM subscriptions');
  subs = {};
  results.forEach(sub => {
    if (!subs[sub.space]) subs[sub.space] = [];
    subs[sub.space].push(sub);
  });
  console.log('Discord Subscriptions', Object.keys(subs).length);
}
