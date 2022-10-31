import db from './helpers/mysql';

export async function getSubscribers(owner?: string) {
  if (owner)
    return db.queryAsync(
      'SELECT * FROM subscribers WHERE active = 1 AND owner = ? ORDER BY created DESC',
      owner
    );

  return db.queryAsync('SELECT * FROM subscribers');
}

export async function addSubscriber(
  owner: string,
  url: string,
  space: string,
  active: number,
  timestamp: string
) {
  const params = {
    owner,
    url,
    space,
    active,
    created: timestamp
  };

  return await db.queryAsync('INSERT IGNORE INTO subscribers SET ?', params);
}

export async function deactivateSubscriber(id: string) {
  return await db.queryAsync('UPDATE subscribers SET active = 0 WHERE id = ?', id);
}
