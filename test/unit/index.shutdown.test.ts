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

describe('shutdown ordering', () => {
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

  it('does not close the database before metrics drain', async () => {
    let drain: () => void = () => undefined;
    const draining = new Promise<void>(resolve => {
      drain = resolve;
    });
    jest.mocked(initMetrics).mockReturnValue({ stop: jest.fn(() => draining) });
    jest.mocked(runMigrations).mockResolvedValue(undefined);

    await import('../../src/index');
    await new Promise(resolve => setImmediate(resolve));
    process.emit('SIGTERM');
    await new Promise(resolve => setImmediate(resolve));

    expect(closeDatabase).not.toHaveBeenCalled();
    drain();
    await new Promise(resolve => setImmediate(resolve));

    expect(closeDatabase).toHaveBeenCalled();
    expect(exit).toHaveBeenCalledWith(0);
  });
});
