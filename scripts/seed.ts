#!/usr/bin/env ts-node

import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { closeDatabase, db, runMigrations } from '../src/db';
import { metadatas } from '../src/schema';

async function seed() {
  const mci = process.argv[2] ?? '0';
  if (!/^\d+$/.test(mci)) {
    throw new Error(`Invalid MCI '${mci}': expected a non-negative integer`);
  }

  await runMigrations();

  const inserted = await db
    .insert(metadatas)
    .values({ id: 'last_mci', value: mci })
    .onConflictDoNothing()
    .returning();

  if (inserted.length > 0) {
    console.log(`✓ Seeded last_mci with value: ${mci}`);
  } else {
    const existing = await db.query.metadatas.findFirst({
      where: eq(metadatas.id, 'last_mci')
    });
    console.log(`✓ last_mci already exists with value: ${existing?.value}`);
  }
}

seed()
  .then(closeDatabase)
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
