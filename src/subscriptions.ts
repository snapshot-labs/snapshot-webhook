import db from './mysql';

export let subs = {};

export async function loadSubscriptions() {
  db.queryAsync('SELECT * FROM subscriptions').then(results => {
    subs = {};
    results.forEach(sub => {
      if (!subs[sub.space]) subs[sub.space] = [];
      subs[sub.space].push(sub);
    });
  });
}
