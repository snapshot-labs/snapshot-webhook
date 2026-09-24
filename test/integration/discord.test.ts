import { EventEmitter } from 'events';
import { DiscordAPIError } from 'discord.js';
import { like } from 'drizzle-orm';
import { closeDatabase, db } from '../../src/db';
import client, { send, sendMessage } from '../../src/providers/discord';
import { subscriptions } from '../../src/schema';

jest.mock('discord.js', () => {
  const actual = jest.requireActual('discord.js');
  const { EventEmitter } = jest.requireActual('events');

  class FakeClient extends EventEmitter {
    channels = { cache: new Map(), fetch: jest.fn() };
    guilds = { cache: new Map() };
    user = { tag: 'test', setActivity: jest.fn() };
    login = jest.fn();
  }

  class FakeREST {
    setToken() {
      return this;
    }

    put() {
      return Promise.resolve();
    }
  }

  return { ...actual, Client: FakeClient, REST: FakeREST };
});

const PREFIX = 'discord-integration-test-';
const fakeClient = client as EventEmitter & {
  channels: { cache: Map<string, any>; fetch: jest.Mock };
  guilds: { cache: Map<string, any> };
};

const emit = (event: string, ...args: unknown[]) =>
  Promise.all(fakeClient.listeners(event).map(listener => listener(...args)));
const apiError = (code: number, status: number) =>
  new DiscordAPIError({ code, message: 'err' }, code, status, 'GET', '', {});
const seed = async (
  rows: { guild: string; channel: string; space?: string }[]
) => {
  await db.insert(subscriptions).values(
    rows.map(row => ({
      guild: `${PREFIX}${row.guild}`,
      channel: `${PREFIX}${row.channel}`,
      space: row.space ?? 'foo.eth',
      mention: '',
      events: ['proposal/deleted'],
      created: 0,
      updated: 0
    }))
  );
  await emit('ready');
};
const storedChannels = async () =>
  (
    await db.query.subscriptions.findMany({
      where: like(subscriptions.guild, `${PREFIX}%`)
    })
  )
    .map(row => row.channel.slice(PREFIX.length))
    .sort();
const notifiedChannels = async () => {
  fakeClient.channels.fetch.mockClear();
  await send(
    { event: 'proposal/deleted' },
    { id: '0x1', space: { id: 'foo.eth' } },
    []
  );
  return fakeClient.channels.fetch.mock.calls
    .map(([id]) => id.slice(PREFIX.length))
    .sort();
};
const expectSubscribed = async (channels: string[]) => {
  expect(await storedChannels()).toEqual(channels);
  expect(await notifiedChannels()).toEqual(channels);
};

beforeEach(async () => {
  await db.delete(subscriptions).where(like(subscriptions.guild, `${PREFIX}%`));
  fakeClient.channels.cache.clear();
  fakeClient.guilds.cache.clear();
  fakeClient.channels.fetch.mockResolvedValue({ send: jest.fn() });
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterAll(async () => {
  await db.delete(subscriptions).where(like(subscriptions.guild, `${PREFIX}%`));
  await closeDatabase();
});

describe('sendMessage()', () => {
  it.each([
    ['Unknown Channel', 10003, 404],
    ['Unknown Guild', 10004, 404]
  ])(
    'removes every subscription of the channel on %s',
    async (_, code, status) => {
      await seed([
        { guild: 'g1', channel: 'dead', space: 'foo.eth' },
        { guild: 'g1', channel: 'dead', space: 'bar.eth' },
        { guild: 'g1', channel: 'alive' }
      ]);
      fakeClient.channels.fetch.mockRejectedValueOnce(apiError(code, status));

      await sendMessage(`${PREFIX}dead`, {});

      await expectSubscribed(['alive']);
    }
  );

  it.each([
    ['Missing Access', 50001, 403],
    ['Missing Permissions', 50013, 403]
  ])('keeps the subscription on %s', async (_, code, status) => {
    await seed([{ guild: 'g1', channel: 'locked' }]);
    fakeClient.channels.fetch.mockRejectedValueOnce(apiError(code, status));

    await sendMessage(`${PREFIX}locked`, {});

    await expectSubscribed(['locked']);
  });

  it('keeps the subscription on a network error', async () => {
    await seed([{ guild: 'g1', channel: 'flaky' }]);
    fakeClient.channels.fetch.mockRejectedValueOnce(
      new Error('Connect Timeout Error')
    );

    await sendMessage(`${PREFIX}flaky`, {});

    await expectSubscribed(['flaky']);
  });
});

describe('gateway events', () => {
  it('removes the subscriptions of a guild the bot left', async () => {
    await seed([
      { guild: 'gone', channel: 'a' },
      { guild: 'gone', channel: 'b' },
      { guild: 'kept', channel: 'c' }
    ]);

    await emit('guildDelete', { id: `${PREFIX}gone` });

    await expectSubscribed(['c']);
  });

  it.each(['channelDelete', 'threadDelete'])(
    'removes the subscriptions of a channel on %s',
    async event => {
      await seed([
        { guild: 'g1', channel: 'deleted' },
        { guild: 'g1', channel: 'kept' }
      ]);

      await emit(event, { id: `${PREFIX}deleted` });

      await expectSubscribed(['kept']);
    }
  );

  it('removes on ready the subscriptions of guilds the bot is no longer in', async () => {
    await seed([
      { guild: 'member', channel: 'a' },
      { guild: 'unavailable', channel: 'b' },
      { guild: 'left', channel: 'c' }
    ]);
    fakeClient.guilds.cache.set(`${PREFIX}member`, { available: true });
    fakeClient.guilds.cache.set(`${PREFIX}unavailable`, { available: false });

    await emit('ready');

    await expectSubscribed(['a', 'b']);
  });

  it('removes nothing on ready when the guild cache is empty', async () => {
    await seed([{ guild: 'member', channel: 'a' }]);

    await emit('ready');

    await expectSubscribed(['a']);
  });
});
