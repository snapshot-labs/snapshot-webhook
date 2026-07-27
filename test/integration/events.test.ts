import { eq } from 'drizzle-orm';
import * as dbModule from '../../src/db';
import * as eventsModule from '../../src/events';
import * as schemaModule from '../../src/schema';

const PROPOSAL_ID = '0xdeadbeef-integration-test';
const ID = `proposal/${PROPOSAL_ID}`;

const mockIpfsGet = jest.fn(async (): Promise<any> => {
  return { data: { message: { proposal: PROPOSAL_ID } } };
});
jest.mock('@snapshot-labs/snapshot.js', () => {
  const originalModule = jest.requireActual('@snapshot-labs/snapshot.js');

  return {
    ...originalModule,
    utils: {
      ...originalModule.utils,
      ipfsGet: () => mockIpfsGet()
    }
  };
});

jest.mock('../../src/providers', () => ({ __esModule: true, default: [] }));

const d = process.env.DATABASE_URL?.startsWith('postgres')
  ? describe
  : describe.skip;

d('handleDeletedEvent()', () => {
  let db: typeof dbModule.db;
  let closeDatabase: typeof dbModule.closeDatabase;
  let events: typeof schemaModule.events;
  let handleDeletedEvent: typeof eventsModule.handleDeletedEvent;

  const getRows = () => db.query.events.findMany({ where: eq(events.id, ID) });
  const cleanup = () => db.delete(events).where(eq(events.id, ID));

  beforeAll(async () => {
    // Imported lazily so a skipped suite (no Postgres DATABASE_URL) never
    // loads src/db, which throws without one.
    let runMigrations: typeof dbModule.runMigrations;
    ({ db, closeDatabase, runMigrations } = await import('../../src/db'));
    ({ events } = await import('../../src/schema'));
    ({ handleDeletedEvent } = await import('../../src/events'));
    await runMigrations();
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await closeDatabase();
  });

  it('replaces pending events with a proposal/deleted event expiring immediately', async () => {
    await db.insert(events).values([
      { id: ID, event: 'proposal/start', space: 'test.eth', expire: 9e9 },
      { id: ID, event: 'proposal/end', space: 'test.eth', expire: 9e9 }
    ]);

    await handleDeletedEvent({ space: 'test.eth', ipfs: 'QmTest' });

    expect(await getRows()).toEqual([
      expect.objectContaining({ event: 'proposal/deleted', expire: 0 })
    ]);
  });

  it('is idempotent when the proposal/deleted event already exists', async () => {
    await expect(
      handleDeletedEvent({ space: 'test.eth', ipfs: 'QmTest' })
    ).resolves.not.toThrow();

    expect(await getRows()).toEqual([
      expect.objectContaining({ event: 'proposal/deleted', expire: 0 })
    ]);
  });
});
