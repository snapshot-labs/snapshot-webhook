import { capture } from '@snapshot-labs/snapshot-sentry';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import * as schema from './schema';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

export const LAST_MCI_METADATA_ID = 'last_mci';

export const db = drizzle({
  connection: {
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 60e3,
    query_timeout: 60e3,
    statement_timeout: 60e3,
    // above the 10-15s poll cadence so the pollers' connection stays warm
    idleTimeoutMillis: 60e3,
    keepAlive: true
  },
  schema
});

// Without a listener, an error on an idle pooled client (e.g. a PG failover) is an
// unhandled EventEmitter 'error' and crashes the process.
db.$client.on('error', err => capture(err));

export async function runMigrations() {
  // No advisory lock — replicas racing this DDL self-heal: the loser errors on
  // whichever CREATE it loses (schema, ledger, or a table inside the migration
  // txn), exits, and restarts into a no-op via the __drizzle_migrations ledger.
  // Single instance today; if replicas >1, migrate in a deploy step.
  await migrate(db, { migrationsFolder: 'drizzle' });
}

export async function getLastMci() {
  const result = await db.query.metadatas.findFirst({
    where: eq(schema.metadatas.id, LAST_MCI_METADATA_ID)
  });
  if (!result) {
    throw new Error(
      "Missing 'last_mci' row in _metadatas: run `yarn db:set-mci <mci>` before starting replay"
    );
  }
  if (!/^\d+$/.test(result.value)) {
    throw new Error(
      `Invalid 'last_mci' value in _metadatas: '${result.value}' is not a non-negative integer`
    );
  }
  return parseInt(result.value, 10);
}

export async function updateLastMci(mci: number | string) {
  const value = mci.toString();
  await db
    .insert(schema.metadatas)
    .values({ id: LAST_MCI_METADATA_ID, value })
    .onConflictDoUpdate({ target: schema.metadatas.id, set: { value } });
}

export async function closeDatabase() {
  await db.$client.end();
  console.log('Database connection pool closed.');
}
