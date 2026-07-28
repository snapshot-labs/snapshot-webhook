// './setup' must stay first: it loads env vars before db.ts reads DATABASE_URL
import './setup';
import { closeDatabase, runMigrations } from '../src/db';

export default async function globalSetup() {
  const dbName = new URL(process.env.DATABASE_URL ?? '').pathname.replace(
    /^\//,
    ''
  );
  if (dbName !== 'snapshot_webhook_test') {
    throw new Error(
      `Refusing to run migrations/tests: DATABASE_URL must point to the "snapshot_webhook_test" database, got "${dbName}"`
    );
  }
  await runMigrations();
  await closeDatabase();
}
