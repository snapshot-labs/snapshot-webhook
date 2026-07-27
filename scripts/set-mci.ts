#!/usr/bin/env ts-node

import 'dotenv/config';
import { closeDatabase, db, runMigrations } from '../src/db';
import { metadatas } from '../src/schema';

async function setMci() {
  const mci = process.argv[2];
  if (!mci || !/^\d+$/.test(mci)) {
    throw new Error(
      `Usage: yarn db:set-mci <mci> — expected a non-negative integer, got '${
        mci ?? ''
      }'`
    );
  }

  await runMigrations();

  await db
    .insert(metadatas)
    .values({ id: 'last_mci', value: mci })
    .onConflictDoUpdate({ target: metadatas.id, set: { value: mci } });

  console.log(`✓ last_mci set to ${mci}`);
}

setMci()
  .then(closeDatabase)
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
