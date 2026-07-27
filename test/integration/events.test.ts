import { eq, inArray } from 'drizzle-orm';
import { closeDatabase, db, runMigrations } from '../../src/db';
import { handleDeletedEvent } from '../../src/events';
import { events } from '../../src/schema';

const PROPOSAL_ID = '0xdeadbeef-integration-test';
const ID = `proposal/${PROPOSAL_ID}`;
const OTHER_ID = 'proposal/0xother-integration-test';

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

describe('handleDeletedEvent()', () => {
  const getRows = (id = ID) =>
    db.query.events.findMany({
      where: eq(events.id, id),
      orderBy: events.event
    });
  const cleanup = () =>
    db.delete(events).where(inArray(events.id, [ID, OTHER_ID]));

  beforeAll(async () => {
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
      { id: ID, event: 'proposal/end', space: 'test.eth', expire: 9e9 },
      { id: OTHER_ID, event: 'proposal/start', space: 'test.eth', expire: 9e9 },
      { id: OTHER_ID, event: 'proposal/end', space: 'test.eth', expire: 9e9 }
    ]);

    await handleDeletedEvent({ space: 'test.eth', ipfs: 'QmTest' });

    expect(await getRows()).toEqual([
      expect.objectContaining({ event: 'proposal/deleted', expire: 0 })
    ]);
  });

  it('does not touch other proposals events', async () => {
    expect(await getRows(OTHER_ID)).toEqual([
      expect.objectContaining({ event: 'proposal/end' }),
      expect.objectContaining({ event: 'proposal/start' })
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
