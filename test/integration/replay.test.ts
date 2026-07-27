import { eq } from 'drizzle-orm';
import {
  closeDatabase,
  db,
  getLastMci,
  LAST_MCI_METADATA_ID,
  updateLastMci
} from '../../src/db';
import { metadatas } from '../../src/schema';

describe('last_mci metadata', () => {
  const cleanup = () =>
    db.delete(metadatas).where(eq(metadatas.id, LAST_MCI_METADATA_ID));

  beforeAll(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await closeDatabase();
  });

  it('getLastMci throws when the row is missing', async () => {
    await expect(getLastMci()).rejects.toThrow('yarn db:set-mci');
  });

  it('updateLastMci bootstraps the row when absent', async () => {
    await updateLastMci(123);

    expect(await getLastMci()).toBe(123);
  });

  it('updateLastMci overwrites an existing value', async () => {
    await updateLastMci(456);

    expect(await getLastMci()).toBe(456);
  });
});
