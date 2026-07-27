// './setup' must stay first: it loads env vars before db.ts reads DATABASE_URL
import './setup';
import { closeDatabase, runMigrations } from '../src/db';

export default async function globalSetup() {
  await runMigrations();
  await closeDatabase();
}
