import mysql from 'mysql';
import Pool from 'mysql/lib/Pool';
import Connection from 'mysql/lib/Connection';
import bluebird from 'bluebird';
import parse from 'connection-string';

const connectionLimit = parseInt(process.env.CONNECTION_LIMIT || '5');

// @ts-ignore
const config = parse(process.env.DATABASE_URL);
config.connectionLimit = connectionLimit;
config.multipleStatements = true;
config.database = config.path[0];
config.host = config.hosts[0].name;
config.port = config.hosts[0].port;
config.connectTimeout = 60e3;
config.acquireTimeout = 60e3;
config.timeout = 60e3;
config.charset = 'utf8mb4';
bluebird.promisifyAll([Pool, Connection]);

console.log({
  config: {
    connectionLimit: config.connectionLimit,
    multipleStatements: config.multipleStatements,
    database: config.database,
    host: config.host,
    port: config.port,
    connectTimeout: config.connectTimeout,
    acquireTimeout: config.acquireTimeout,
    timeout: config.timeout,
    charset: config.charset
  }
});
const db = mysql.createPool(config);

export default db;
