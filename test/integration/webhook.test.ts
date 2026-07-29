import { eq } from 'drizzle-orm';
import { closeDatabase, db } from '../../src/db';
import { send } from '../../src/providers/webhook';
import { subscribers } from '../../src/schema';

const OWNER = 'webhook-integration-test';

const mockFetch = jest.fn();
jest.mock('@snapshot-labs/snapshot.js', () => {
  const originalModule = jest.requireActual('@snapshot-labs/snapshot.js');

  return {
    ...originalModule,
    utils: {
      ...originalModule.utils,
      fetch: (...args: any[]) => mockFetch(...args)
    }
  };
});

const EVENT = {
  id: 'proposal/0xabc',
  space: 'foo.eth',
  event: 'proposal/created',
  expire: 1647343155
};

const flush = () => new Promise(resolve => setImmediate(resolve));
const deliveredUrls = () => mockFetch.mock.calls.map(call => call[0]).sort();
const seed = (rows: Partial<typeof subscribers.$inferInsert>[]) =>
  db.insert(subscribers).values(
    rows.map((row, i) => ({
      owner: OWNER,
      url: `https://webhook-integration.test/${i}`,
      space: 'foo.eth',
      ...row
    }))
  );

beforeEach(async () => {
  await db.delete(subscribers).where(eq(subscribers.owner, OWNER));
  mockFetch.mockResolvedValue({ status: 200 });
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterAll(async () => {
  await db.delete(subscribers).where(eq(subscribers.owner, OWNER));
  await closeDatabase();
});

describe('send()', () => {
  it('sends to subscribers of the event space and to wildcard subscribers', async () => {
    await seed([
      { url: 'https://webhook-integration.test/exact' },
      { url: 'https://webhook-integration.test/wildcard', space: '*' },
      { url: 'https://webhook-integration.test/other', space: 'bar.eth' }
    ]);

    await send(EVENT, null, []);
    await flush();

    expect(deliveredUrls()).toEqual([
      'https://webhook-integration.test/exact',
      'https://webhook-integration.test/wildcard'
    ]);
  });

  it('keeps the exact match when collation variants exist alongside it', async () => {
    await seed([
      { url: 'https://webhook-integration.test/exact' },
      { space: 'FOO.ETH' },
      { space: 'Foo.Eth' },
      { space: 'fóo.eth' },
      { space: 'foo.eth ' },
      { url: 'https://webhook-integration.test/wildcard', space: '*' }
    ]);

    await send(EVENT, null, []);
    await flush();

    expect(deliveredUrls()).toEqual([
      'https://webhook-integration.test/exact',
      'https://webhook-integration.test/wildcard'
    ]);
  });

  it('still delivers to other subscribers when one delivery fails', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await seed([
      { url: 'https://webhook-integration.test/failing' },
      { url: 'https://webhook-integration.test/working' }
    ]);
    mockFetch.mockImplementation(url =>
      url === 'https://webhook-integration.test/failing'
        ? Promise.reject(new Error('boom'))
        : Promise.resolve({ status: 200 })
    );

    await expect(send(EVENT, null, [])).resolves.not.toThrow();
    await flush();

    expect(deliveredUrls()).toEqual([
      'https://webhook-integration.test/failing',
      'https://webhook-integration.test/working'
    ]);
  });

  it('does not send to inactive subscribers', async () => {
    await seed([{ active: false }]);

    await send(EVENT, null, []);
    await flush();

    expect(deliveredUrls()).toEqual([]);
  });

  it('uses the method stored on the subscriber', async () => {
    await seed([
      { url: 'https://webhook-integration.test/get', method: 'GET' }
    ]);

    await send(EVENT, null, []);
    await flush();

    expect(mockFetch).toHaveBeenCalledWith(
      'https://webhook-integration.test/get',
      expect.objectContaining({ method: 'GET' })
    );
  });
});
