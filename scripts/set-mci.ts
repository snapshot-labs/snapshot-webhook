#!/usr/bin/env ts-node

import 'dotenv/config';
import { closeDatabase, runMigrations, updateLastMci } from '../src/db';

async function setMci() {
  const mci = process.argv[2];
  if (!mci || !/^\d+$/.test(mci)) {
    console.error(
      `Usage: yarn db:set-mci <mci> — expected a non-negative integer, got '${
        mci ?? ''
      }'`
    );
    process.exit(1);
  }

  await runMigrations();

  await updateLastMci(mci);

  console.log(`✓ last_mci set to ${mci}`);
}

setMci()
  .then(closeDatabase)
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
