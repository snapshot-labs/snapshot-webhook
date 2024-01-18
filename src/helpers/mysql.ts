import mysql from 'mysql';
import Pool from 'mysql/lib/Pool';
import Connection from 'mysql/lib/Connection';
import bluebird from 'bluebird';
import { ConnectionString } from 'connection-string';

const config = new ConnectionString(process.env.DATABASE_URL as string);
bluebird.promisifyAll([Pool, Connection]);
const db = mysql.createPool({
  ...config,
  host: config.hosts?.[0].name,
  port: config.hosts?.[0].port,
  connectionLimit: parseInt(process.env.CONNECTION_LIMIT ?? '5'),
  multipleStatements: true,
  connectTimeout: 60e3,
  acquireTimeout: 60e3,
  timeout: 60e3,
  charset: 'utf8mb4',
  database: config.path?.[0]
});

export default db;
