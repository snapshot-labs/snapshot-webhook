jest.mock('@snapshot-labs/snapshot-sentry', () => ({ capture: jest.fn() }));
jest.mock('discord.js', () => {
  const handlers: Record<string, (...args: any[]) => void> = {};
  const client = {
    channels: { cache: new Map(), fetch: jest.fn() },
    destroy: jest.fn(),
    login: jest.fn().mockResolvedValue(undefined),
    on: jest.fn((event: string, handler: (...args: any[]) => void) => {
      handlers[event] = handler;
    }),
    user: { setActivity: jest.fn(), tag: 'bot' },
    ws: { ping: 1 }
  };
  const makeBuilder = () => {
    const builder: any = new Proxy(
      {},
      {
        get: (_, key) => {
          if (key === 'then') return undefined;
          return (...args: any[]) => {
            for (const arg of args) {
              if (typeof arg === 'function') arg(makeBuilder());
            }
            return builder;
          };
        }
      }
    );
    return builder;
  };
  const Builder = jest.fn(function () {
    return makeBuilder();
  });
  return {
    __esModule: true,
    handlers,
    client,
    Client: jest.fn(function () {
      return client;
    }),
    REST: Builder,
    SlashCommandBuilder: Builder,
    ActionRowBuilder: Builder,
    ButtonBuilder: Builder,
    EmbedBuilder: Builder,
    StringSelectMenuBuilder: Builder,
    StringSelectMenuOptionBuilder: Builder,
    ButtonStyle: { Link: 1 },
    ComponentType: { StringSelect: 1 },
    DiscordAPIError: class extends Error {},
    GatewayIntentBits: {
      Guilds: 1,
      GuildMessages: 2,
      DirectMessages: 3
    },
    Options: { cacheWithLimits: jest.fn(() => ({})) },
    PermissionsBitField: { Flags: { ViewChannel: 1, SendMessages: 2 } },
    Routes: { applicationCommands: jest.fn(() => 'commands') },
    codeBlock: (value: string) => value,
    inlineCode: (value: string) => value,
    underscore: (value: string) => value
  };
});
jest.mock('remove-markdown', () => ({
  __esModule: true,
  default: (value: string) => value
}));
jest.mock('../../../src/helpers/metrics', () => ({
  outgoingMessages: { inc: jest.fn() },
  timeOutgoingRequest: { startTimer: jest.fn(() => jest.fn()) }
}));
jest.mock('../../../src/db', () => {
  const deleteWhere = jest.fn();
  const findMany = jest.fn();
  return {
    __esModule: true,
    deleteWhere,
    findMany,
    db: {
      delete: () => ({ where: deleteWhere }),
      query: { subscriptions: { findMany } }
    }
  };
});
jest.mock('../../../src/helpers/utils', () => ({
  getSpace: jest.fn(),
  shortenAddress: jest.fn()
}));

import * as discordJs from 'discord.js';
import * as dbModule from '../../../src/db';
import { stop } from '../../../src/providers/discord';

const { deleteWhere, findMany } = dbModule as unknown as {
  deleteWhere: jest.Mock;
  findMany: jest.Mock;
};

const loginCallsAtImport = (discordJs as any).client.login.mock.calls.length;

describe('Discord shutdown', () => {
  it('does not log in at module import', () => {
    expect(loginCallsAtImport).toBe(0);
  });

  it('waits for an active interaction before destroying the client', async () => {
    let remove: (value: unknown) => void = () => undefined;
    const removing = new Promise<unknown>(resolve => {
      remove = resolve;
    });
    deleteWhere.mockImplementationOnce(() => removing);
    findMany.mockResolvedValue([]);
    const interaction = {
      commandName: 'remove',
      guildId: 'guild',
      isChatInputCommand: () => true,
      options: {
        getChannel: () => ({ id: 'channel' }),
        getString: (name: string) => (name === 'space' ? 'space' : null)
      },
      reply: jest.fn().mockResolvedValue(undefined),
      user: { username: 'user' }
    };
    const discord = discordJs as any;
    let destroy: () => void = () => undefined;
    const destroying = new Promise<void>(resolve => {
      destroy = resolve;
    });
    discord.client.destroy.mockReturnValue(destroying);

    discord.handlers.interactionCreate(interaction);
    await new Promise(resolve => setImmediate(resolve));

    let stopped = false;
    const draining = stop().then(() => {
      stopped = true;
    });
    await Promise.resolve();
    expect(stopped).toBe(false);
    expect(discord.client.destroy).not.toHaveBeenCalled();

    remove(undefined);
    await new Promise(resolve => setImmediate(resolve));
    expect(stopped).toBe(false);
    expect(deleteWhere).toHaveBeenCalledTimes(1);
    expect(findMany).toHaveBeenCalledTimes(1);

    destroy();
    await draining;

    expect(interaction.reply).toHaveBeenCalled();
    expect(discord.client.destroy).toHaveBeenCalled();

    discord.handlers.interactionCreate(interaction);
    await new Promise(resolve => setImmediate(resolve));
    expect(deleteWhere).toHaveBeenCalledTimes(1);
  });
});
