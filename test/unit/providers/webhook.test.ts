import { timeOutgoingRequest } from '../../../src/helpers/metrics';
import { send } from '../../../src/providers/webhook';

const mockQueryAsync = jest.fn();
jest.mock('../../../src/helpers/mysql', () => ({
  __esModule: true,
  default: {
    queryAsync: (...args: any[]) => mockQueryAsync(...args)
  }
}));

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

jest.mock('../../../src/helpers/metrics', () => ({
  __esModule: true,
  outgoingMessages: { inc: jest.fn() },
  timeOutgoingRequest: { startTimer: jest.fn() }
}));

const EVENT = {
  id: 'proposal/0xabc',
  space: 'foo.eth',
  event: 'proposal/created',
  expire: 1647343155
};

const flush = () => new Promise(resolve => setImmediate(resolve));
const deliveredUrls = () => mockFetch.mock.calls.map(call => call[0]).sort();

beforeEach(() => {
  (timeOutgoingRequest.startTimer as jest.Mock).mockReturnValue(jest.fn());
  mockFetch.mockResolvedValue({ status: 200 });
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});

describe('webhook provider', () => {
  describe('send()', () => {
    it('filters on the indexed space column in SQL', async () => {
      mockQueryAsync.mockResolvedValueOnce([]);

      await send(EVENT, null, []);

      expect(mockQueryAsync).toHaveBeenCalledWith(
        'SELECT space, url, method FROM subscribers WHERE active = 1 AND space IN (?)',
        [['foo.eth', '*']]
      );
    });

    it('sends to subscribers of the event space and to wildcard subscribers', async () => {
      mockQueryAsync.mockResolvedValueOnce([
        { space: 'foo.eth', url: 'https://exact.test', method: 'POST' },
        { space: '*', url: 'https://wildcard.test', method: 'POST' }
      ]);

      await send(EVENT, null, []);
      await flush();

      expect(deliveredUrls()).toEqual([
        'https://exact.test',
        'https://wildcard.test'
      ]);
    });

    it.each([
      ['an upper-case variant', 'FOO.ETH'],
      ['a mixed-case variant', 'Foo.Eth'],
      ['an accented variant', 'fóo.eth'],
      ['a trailing-space variant', 'foo.eth ']
    ])('does not send to %s of the event space', async (_label, space) => {
      mockQueryAsync.mockResolvedValueOnce([
        { space, url: 'https://variant.test', method: 'POST' }
      ]);

      await send(EVENT, null, []);
      await flush();

      expect(deliveredUrls()).toEqual([]);
    });

    it('keeps the exact match when collation variants are returned alongside it', async () => {
      mockQueryAsync.mockResolvedValueOnce([
        { space: 'foo.eth', url: 'https://exact.test', method: 'POST' },
        { space: 'FOO.ETH', url: 'https://upper.test', method: 'POST' },
        { space: 'Foo.Eth', url: 'https://mixed.test', method: 'POST' },
        { space: 'fóo.eth', url: 'https://accent.test', method: 'POST' },
        { space: 'foo.eth ', url: 'https://trailing.test', method: 'POST' },
        { space: '*', url: 'https://wildcard.test', method: 'POST' }
      ]);

      await send(EVENT, null, []);
      await flush();

      expect(deliveredUrls()).toEqual([
        'https://exact.test',
        'https://wildcard.test'
      ]);
    });

    it('logs the number of subscribers actually sent to, not the candidate count', async () => {
      mockQueryAsync.mockResolvedValueOnce([
        { space: 'foo.eth', url: 'https://exact.test', method: 'POST' },
        { space: 'FOO.ETH', url: 'https://upper.test', method: 'POST' },
        { space: 'foo.eth ', url: 'https://trailing.test', method: 'POST' }
      ]);

      await send(EVENT, null, []);
      await flush();

      expect(console.log).toHaveBeenCalledWith(
        '[webhook] subscribers for',
        'foo.eth',
        1
      );
    });

    it('uses the method stored on the subscriber', async () => {
      mockQueryAsync.mockResolvedValueOnce([
        { space: 'foo.eth', url: 'https://get.test', method: 'GET' }
      ]);

      await send(EVENT, null, []);
      await flush();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://get.test',
        expect.objectContaining({ method: 'GET' })
      );
    });
  });
});
