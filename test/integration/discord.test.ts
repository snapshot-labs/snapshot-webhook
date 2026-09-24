import { EventEmitter } from 'events';
import { DiscordAPIError } from 'discord.js';
import { like } from 'drizzle-orm';
import { closeDatabase, db } from '../../src/db';
import client, { sendMessage } from '../../src/providers/discord';
import { subscriptions } from '../../src/schema';

jest.mock('discord.js', () => {
  const actual = jest.requireActual('discord.js');
  const { EventEmitter } = jest.requireActual('events');

  class FakeClient extends EventEmitter {
    channels = { cache: new Map(), fetch: jest.fn() };
    guilds = { cache: new Map() };
    user = { tag: 'test', setActivity: jest.fn() };
    ws = { ping: 0 };
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

const flush = () => new Promise(resolve => setTimeout(resolve, 50));
const apiError = (code: number, status: number) =>
  new DiscordAPIError({ code, message: 'err' }, code, status, 'GET', '', {});
const seed = (rows: { guild: string; channel: string; space?: string }[]) =>
  db.insert(subscriptions).values(
    rows.map(row => ({
      guild: `${PREFIX}${row.guild}`,
      channel: `${PREFIX}${row.channel}`,
      space: row.space ?? 'foo.eth',
      mention: '',
      created: 0,
      updated: 0
    }))
  );
const remainingChannels = async () =>
  (
    await db.query.subscriptions.findMany({
      where: like(subscriptions.guild, `${PREFIX}%`)
    })
  )
    .map(row => row.channel.slice(PREFIX.length))
    .sort();

beforeEach(async () => {
  await db.delete(subscriptions).where(like(subscriptions.guild, `${PREFIX}%`));
  fakeClient.channels.cache.clear();
  fakeClient.guilds.cache.clear();
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

      expect(await remainingChannels()).toEqual(['alive']);
    }
  );

  it.each([
    ['Missing Access', 50001, 403],
    ['Missing Permissions', 50013, 403]
  ])('keeps the subscription on %s', async (_, code, status) => {
    await seed([{ guild: 'g1', channel: 'locked' }]);
    fakeClient.channels.fetch.mockRejectedValueOnce(apiError(code, status));

    await sendMessage(`${PREFIX}locked`, {});

    expect(await remainingChannels()).toEqual(['locked']);
  });

  it('keeps the subscription on a network error', async () => {
    await seed([{ guild: 'g1', channel: 'flaky' }]);
    fakeClient.channels.fetch.mockRejectedValueOnce(
      new Error('Connect Timeout Error')
    );

    await sendMessage(`${PREFIX}flaky`, {});

    expect(await remainingChannels()).toEqual(['flaky']);
  });
});

describe('gateway events', () => {
  it('removes the subscriptions of a guild the bot left', async () => {
    await seed([
      { guild: 'gone', channel: 'a' },
      { guild: 'gone', channel: 'b' },
      { guild: 'kept', channel: 'c' }
    ]);

    fakeClient.emit('guildDelete', { id: `${PREFIX}gone` });
    await flush();

    expect(await remainingChannels()).toEqual(['c']);
  });

  it.each(['channelDelete', 'threadDelete'])(
    'removes the subscriptions of a channel on %s',
    async event => {
      await seed([
        { guild: 'g1', channel: 'deleted' },
        { guild: 'g1', channel: 'kept' }
      ]);

      fakeClient.emit(event, { id: `${PREFIX}deleted` });
      await flush();

      expect(await remainingChannels()).toEqual(['kept']);
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

    fakeClient.emit('ready');
    await flush();

    expect(await remainingChannels()).toEqual(['a', 'b']);
  });

  it('removes nothing on ready when the guild cache is empty', async () => {
    await seed([{ guild: 'member', channel: 'a' }]);

    fakeClient.emit('ready');
    await flush();

    expect(await remainingChannels()).toEqual(['a']);
  });
});
