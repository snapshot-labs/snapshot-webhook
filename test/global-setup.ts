import { config } from 'dotenv';

export default async function globalSetup() {
  config({ path: 'test/.env.test' });
  config();

  const { runMigrations, closeDatabase } = await import('../src/db');
  await runMigrations();
  await closeDatabase();
}
