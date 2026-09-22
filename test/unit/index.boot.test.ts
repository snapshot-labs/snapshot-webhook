jest.mock('@snapshot-labs/snapshot-sentry', () => ({
  capture: jest.fn(),
  fallbackLogger: jest.fn(),
  initLogger: jest.fn(),
  Sentry: { close: jest.fn().mockResolvedValue(true) }
}));
jest.mock('express', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    get: jest.fn(),
    use: jest.fn(),
    listen: jest.fn((_: unknown, callback: () => void) => {
      callback();
      return {
        close: jest.fn((done: (err?: Error) => void) => done())
      };
    })
  }))
}));
jest.mock('../../src/api', () => ({ __esModule: true, default: {} }));
jest.mock('../../src/events', () => ({
  start: jest.fn(),
  stop: jest.fn().mockResolvedValue(undefined)
}));
jest.mock('../../src/helpers/metrics', () => ({
  __esModule: true,
  default: jest.fn()
}));
jest.mock('../../src/db', () => ({
  closeDatabase: jest.fn().mockResolvedValue(undefined),
  runMigrations: jest.fn()
}));
jest.mock('../../src/providers/discord', () => ({
  start: jest.fn().mockResolvedValue(undefined),
  stop: jest.fn().mockResolvedValue(undefined)
}));
jest.mock('../../src/replay', () => ({
  last_mci: 0,
  start: jest.fn(),
  stop: jest.fn().mockResolvedValue(undefined)
}));

import { closeDatabase, runMigrations } from '../../src/db';
import initMetrics from '../../src/helpers/metrics';
import { start as startReplay } from '../../src/replay';

describe('boot ordering', () => {
  const inheritedListeners = new Set(process.listeners('SIGTERM'));
  let consoleLog: jest.SpyInstance;
  let exit: jest.SpyInstance;

  beforeEach(() => {
    consoleLog = jest.spyOn(console, 'log').mockImplementation();
    exit = jest
      .spyOn(process, 'exit')
      .mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    for (const listener of process.listeners('SIGTERM')) {
      if (!inheritedListeners.has(listener))
        process.removeListener('SIGTERM', listener);
    }
    consoleLog.mockRestore();
    exit.mockRestore();
  });

  it('handles a signal arriving while migrations are still running', async () => {
    let migrated: () => void = () => undefined;
    const migrating = new Promise<void>(resolve => {
      migrated = resolve;
    });
    jest.mocked(initMetrics).mockReturnValue({
      stop: jest.fn().mockResolvedValue(undefined)
    });
    jest.mocked(runMigrations).mockReturnValue(migrating);

    await import('../../src/index');
    await new Promise(resolve => setImmediate(resolve));

    expect(runMigrations).toHaveBeenCalled();
    expect(startReplay).not.toHaveBeenCalled();
    expect(
      process.listeners('SIGTERM').some(l => !inheritedListeners.has(l))
    ).toBe(true);

    process.emit('SIGTERM');
    await new Promise(resolve => setImmediate(resolve));

    expect(closeDatabase).toHaveBeenCalled();
    expect(exit).toHaveBeenCalledWith(0);

    migrated();
    await new Promise(resolve => setImmediate(resolve));
  });
});
