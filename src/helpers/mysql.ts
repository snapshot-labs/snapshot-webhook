import mysql from 'mysql';
// @ts-ignore
import Pool from 'mysql/lib/Pool';
// @ts-ignore
import Connection from 'mysql/lib/Connection';
import bluebird from 'bluebird';
import parse from 'connection-string';

const connectionLimit = parseInt(process.env.CONNECTION_LIMIT || '5');

type values = string | number | boolean;
type SqlRow = Record<string, values>;
type SqlQueryArgs = values | Record<string, values>;
interface PromisedPool {
  queryAsync: (query: string, args?: SqlQueryArgs | SqlQueryArgs[]) => Promise<SqlRow[]>;
}

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
const db: PromisedPool = mysql.createPool(config) as mysql.Pool & PromisedPool;

export default db;
