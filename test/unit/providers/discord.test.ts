import client, { send } from '../../../src/providers/discord';

jest.mock('@snapshot-labs/snapshot-sentry', () => ({ capture: jest.fn() }));
jest.mock('../../../src/db', () => ({
  db: {
    query: {
      subscriptions: {
        findMany: jest.fn().mockResolvedValue(
          Array.from({ length: 20 }, (_, i) => ({
            space: 'test.eth',
            channel: `${i}`,
            mention: '',
            events: null
          }))
        )
      }
    }
  }
}));
jest.mock('discord.js', () => {
  const actual = jest.requireActual('discord.js');
  return {
    ...actual,
    Client: jest.fn().mockImplementation(options => {
      const handlers = {};
      return {
        options,
        handlers,
        user: { tag: 'bot', setActivity: jest.fn() },
        on: (name, fn) => (handlers[name] = fn),
        login: jest.fn().mockResolvedValue('token')
      };
    }),
    REST: jest.fn().mockImplementation(() => ({
      setToken() {
        return this;
      },
      put: jest.fn().mockResolvedValue({})
    }))
  };
});

describe('discord send', () => {
  it('caps concurrent channel sends', async () => {
    await client.handlers.ready();

    let inFlight = 0;
    let maxInFlight = 0;
    const pending: (() => void)[] = [];
    client.channels = {
      cache: {
        get: () => ({
          send: () => {
            inFlight++;
            maxInFlight = Math.max(maxInFlight, inFlight);
            return new Promise<void>(resolve =>
              pending.push(() => {
                inFlight--;
                resolve();
              })
            );
          }
        })
      }
    };

    await send(
      { event: 'proposal/deleted' },
      { id: '0x1', space: { id: 'test.eth' } },
      []
    );

    let sent = 0;
    while (sent < 20) {
      await new Promise(resolve => setImmediate(resolve));
      const batch = pending.splice(0);
      if (!batch.length) break;
      batch.forEach(resolve => resolve());
      sent += batch.length;
    }

    expect(sent).toBe(20);
    expect(maxInFlight).toBe(5);
  });
});
