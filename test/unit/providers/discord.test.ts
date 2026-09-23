import snapshot from '@snapshot-labs/snapshot.js';
import { Agent } from 'undici';
import client, { sendMessage } from '../../../src/providers/discord';

jest.mock('@snapshot-labs/snapshot-sentry', () => ({ capture: jest.fn() }));
jest.mock('@snapshot-labs/snapshot.js', () => ({
  utils: { sleep: jest.fn().mockResolvedValue(undefined) }
}));
jest.mock('discord.js', () => {
  const actual = jest.requireActual('discord.js');
  return {
    ...actual,
    Client: jest.fn().mockImplementation(options => ({
      options,
      on: jest.fn(),
      login: jest.fn().mockResolvedValue('token'),
      channels: { cache: new Map(), fetch: jest.fn() }
    })),
    REST: jest.fn().mockImplementation(() => ({
      setToken() {
        return this;
      },
      put: jest.fn().mockResolvedValue({})
    }))
  };
});

const connectTimeout = () =>
  Object.assign(new Error('Connect Timeout Error'), {
    code: 'UND_ERR_CONNECT_TIMEOUT'
  });

describe('discord sendMessage', () => {
  const send = jest.fn();

  beforeEach(() => {
    send.mockReset();
    client.channels.cache.set('1', { send });
  });

  it('shares a capped connection pool across channels', () => {
    expect(client.options.rest.agent).toBeInstanceOf(Agent);
  });

  it('retries a send that failed to connect', async () => {
    send.mockRejectedValueOnce(connectTimeout()).mockResolvedValueOnce({});

    expect(await sendMessage('1', 'hi')).toBe(true);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('gives up after the last retry', async () => {
    send.mockRejectedValue(connectTimeout());

    expect(await sendMessage('1', 'hi')).toBeUndefined();
    expect(send).toHaveBeenCalledTimes(3);
    expect(snapshot.utils.sleep).toHaveBeenNthCalledWith(1, 5e3);
    expect(snapshot.utils.sleep).toHaveBeenNthCalledWith(2, 30e3);
  });

  it('does not retry other errors', async () => {
    send.mockRejectedValue(new Error('Missing Permissions'));

    expect(await sendMessage('1', 'hi')).toBeUndefined();
    expect(send).toHaveBeenCalledTimes(1);
  });
});
