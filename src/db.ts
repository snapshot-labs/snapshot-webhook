import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import * as schema from './schema';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

export const db = drizzle({
  connection: {
    connectionString: process.env.DATABASE_URL,
    // PS-5 caps direct connections at 25; leave headroom for migrations, psql
    // and PlanetScale's reserved connections. Single instance needs far less.
    max: 10,
    connectionTimeoutMillis: 10e3,
    query_timeout: 60e3,
    // above the 10-15s poll cadence so the pollers' connection stays warm
    idleTimeoutMillis: 60e3,
    keepAlive: true
  },
  schema
});

export async function runMigrations() {
  // No advisory lock — replicas racing this DDL self-heal (loser's
  // transaction rolls back, restart no-ops via the __drizzle_migrations
  // ledger). Single instance today; if replicas >1, migrate in a deploy step.
  await migrate(db, { migrationsFolder: 'drizzle' });
}

export async function closeDatabase() {
  await db.$client.end();
  console.log('Database connection pool closed.');
}
