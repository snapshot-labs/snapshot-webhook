import db from './mysql';

const subcribersActiveTime = 30; // days

export const getActiveSubscribers = async space => {
  const subscribersQuery = `
    SELECT * FROM subscribers
    WHERE active = 1 AND (space LIKE CONCAT('%', ?, '%') OR space = "*")
  `;
  const subscribersParams = [space];
  return db.queryAsync(subscribersQuery, subscribersParams);
};

export const updateSubscribers = async (subscribers, allSubscribersStatus) => {
  const subscriberSuccessIds = subscribers
    .filter((_subscriber, index) => allSubscribersStatus[index] === 'success')
    .map(subscriber => subscriber.id);

  const ts = parseInt((Date.now() / 1e3).toFixed());
  let query = ` 
          UPDATE subscribers SET last_attempt = ? WHERE id IN (?); 
        `;
  const params = [ts, subscribers.map(subscriber => subscriber.id)];
  if (subscriberSuccessIds.length) {
    query += `UPDATE subscribers SET last_active = ? WHERE id IN (?);`;
    params.push(ts, subscriberSuccessIds);
  }
  return db.queryAsync(query, params).catch(e => {
    console.log('[events] updateSubscribers failed', e);
  });
};

export const updateActiveSubscribers = async () => {
  const ts = subcribersActiveTime * 24 * 60 * 60;
  const query = `
    UPDATE subscribers SET active = 0 
    WHERE active = 1 AND
    DATEDIFF(CURRENT_TIMESTAMP, created) > ? AND
    last_active + ? < last_attempt;`;
  const params = [subcribersActiveTime, ts];
  return db.queryAsync(query, params).catch(e => {
    console.log('[events] updateActiveSubscribers failed', e);
  });;
};
