import { eq, inArray } from 'drizzle-orm';
import { closeDatabase, db } from '../../src/db';
import { handleCreatedEvent, handleDeletedEvent } from '../../src/events';
import { events } from '../../src/schema';

const PROPOSAL_ID = '0xdeadbeef-integration-test';
const ID = `proposal/${PROPOSAL_ID}`;
const OTHER_ID = 'proposal/0xother-integration-test';

const mockIpfsGet = jest.fn(async (): Promise<any> => {
  return { data: { message: { proposal: PROPOSAL_ID } } };
});
const mockSubgraphRequest = jest.fn(async (): Promise<any> => ({}));
jest.mock('@snapshot-labs/snapshot.js', () => {
  const originalModule = jest.requireActual('@snapshot-labs/snapshot.js');

  return {
    ...originalModule,
    utils: {
      ...originalModule.utils,
      ipfsGet: () => mockIpfsGet(),
      subgraphRequest: () => mockSubgraphRequest()
    }
  };
});

jest.mock('../../src/providers', () => ({ __esModule: true, default: [] }));

const getRows = (id = ID) =>
  db.query.events.findMany({
    where: eq(events.id, id),
    orderBy: events.event
  });

describe('handleCreatedEvent()', () => {
  const cleanup = () => db.delete(events).where(eq(events.id, ID));

  beforeEach(async () => {
    await cleanup();
    mockSubgraphRequest.mockReset();
  });

  it('stores expire from proposal.created/start/end', async () => {
    mockSubgraphRequest.mockResolvedValueOnce({
      proposal: { created: 1000, start: 2000, end: 9e9 }
    });

    await handleCreatedEvent({ id: ID, space: 'test.eth' });

    expect(await getRows()).toEqual([
      expect.objectContaining({ event: 'proposal/created', expire: 1000 }),
      expect.objectContaining({ event: 'proposal/end', expire: 9e9 }),
      expect.objectContaining({ event: 'proposal/start', expire: 2000 })
    ]);
  });

  it('omits proposal/end once the proposal has already ended', async () => {
    mockSubgraphRequest.mockResolvedValueOnce({
      proposal: { created: 1000, start: 2000, end: 1 }
    });

    await handleCreatedEvent({ id: ID, space: 'test.eth' });

    expect(await getRows()).toEqual([
      expect.objectContaining({ event: 'proposal/created', expire: 1000 }),
      expect.objectContaining({ event: 'proposal/start', expire: 2000 })
    ]);
  });
});

describe('handleDeletedEvent()', () => {
  const cleanup = () =>
    db.delete(events).where(inArray(events.id, [ID, OTHER_ID]));
  const seed = () =>
    db.insert(events).values([
      { id: ID, event: 'proposal/start', space: 'test.eth', expire: 9e9 },
      { id: ID, event: 'proposal/end', space: 'test.eth', expire: 9e9 },
      { id: OTHER_ID, event: 'proposal/start', space: 'test.eth', expire: 9e9 },
      { id: OTHER_ID, event: 'proposal/end', space: 'test.eth', expire: 9e9 }
    ]);

  beforeEach(async () => {
    await cleanup();
    await seed();
  });

  afterAll(async () => {
    await cleanup();
    await closeDatabase();
  });

  it('replaces pending events with a proposal/deleted event expiring immediately', async () => {
    await handleDeletedEvent({ space: 'test.eth', ipfs: 'QmTest' });

    expect(await getRows()).toEqual([
      expect.objectContaining({ event: 'proposal/deleted', expire: 0 })
    ]);
  });

  it('does not touch other proposals events', async () => {
    await handleDeletedEvent({ space: 'test.eth', ipfs: 'QmTest' });

    expect(await getRows(OTHER_ID)).toEqual([
      expect.objectContaining({ event: 'proposal/end' }),
      expect.objectContaining({ event: 'proposal/start' })
    ]);
  });

  it('is idempotent when the proposal/deleted event already exists', async () => {
    await handleDeletedEvent({ space: 'test.eth', ipfs: 'QmTest' });

    await expect(
      handleDeletedEvent({ space: 'test.eth', ipfs: 'QmTest' })
    ).resolves.not.toThrow();

    expect(await getRows()).toEqual([
      expect.objectContaining({ event: 'proposal/deleted', expire: 0 })
    ]);
  });
});
