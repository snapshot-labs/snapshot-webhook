#!/usr/bin/env ts-node

import 'dotenv/config';
import { closeDatabase, runMigrations, updateLastMci } from '../src/db';

async function setMci() {
  const mci = process.argv[2];
  // Hub's messages.where.mci_gt is a GraphQL Int: anything above 2^31-1 is
  // rejected by the API, leaving replay failing every cycle instead of idling.
  if (!mci || !/^\d+$/.test(mci) || Number(mci) > 2147483647) {
    console.error(
      `Usage: yarn db:set-mci <mci> — expected an integer between 0 and 2147483647, got '${
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
