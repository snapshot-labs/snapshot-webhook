import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import * as schema from './schema';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

export const db = drizzle({
  connection: {
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 60e3,
    query_timeout: 60e3,
    idleTimeoutMillis: 0,
    keepAlive: true
  },
  schema
});

export async function runMigrations() {
  await migrate(db, { migrationsFolder: 'drizzle' });
  await db
    .insert(schema.metadatas)
    .values({ id: 'last_mci', value: '0' })
    .onConflictDoNothing();
}

export async function closeDatabase() {
  await db.$client.end();
  console.log('Database connection pool closed.');
}
