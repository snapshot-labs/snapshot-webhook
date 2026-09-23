import { Agent } from 'undici';
import client from '../../../src/providers/discord';

jest.mock('@snapshot-labs/snapshot-sentry', () => ({ capture: jest.fn() }));
jest.mock('discord.js', () => {
  const actual = jest.requireActual('discord.js');
  return {
    ...actual,
    Client: jest.fn().mockImplementation(options => ({
      options,
      on: jest.fn(),
      login: jest.fn().mockResolvedValue('token')
    })),
    REST: jest.fn().mockImplementation(() => ({
      setToken() {
        return this;
      },
      put: jest.fn().mockResolvedValue({})
    }))
  };
});

describe('discord client', () => {
  it('shares a capped connection pool across channels', () => {
    expect(client.options.rest.agent).toBeInstanceOf(Agent);
  });
});
