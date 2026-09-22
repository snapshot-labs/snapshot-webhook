jest.mock('@snapshot-labs/snapshot-sentry', () => ({
  capture: jest.fn(),
  Sentry: { close: jest.fn().mockResolvedValue(true) }
}));
jest.mock('@snapshot-labs/snapshot.js', () => ({
  __esModule: true,
  default: { utils: { subgraphRequest: jest.fn() } }
}));
jest.mock('../../src/events', () => ({
  handleCreatedEvent: jest.fn(),
  handleDeletedEvent: jest.fn()
}));
jest.mock('../../src/db', () => ({
  getLastMci: jest.fn().mockResolvedValue(0),
  updateLastMci: jest.fn().mockResolvedValue(undefined)
}));

import snapshot from '@snapshot-labs/snapshot.js';
import { getLastMci, updateLastMci } from '../../src/db';
import { handleCreatedEvent } from '../../src/events';
import { start, stop } from '../../src/replay';

describe('replay shutdown', () => {
  it('does not start another message after stop', async () => {
    let index: () => void = () => undefined;
    const indexing = new Promise<void>(resolve => {
      index = resolve;
    });
    jest
      .mocked(handleCreatedEvent)
      .mockImplementationOnce(() => indexing as any)
      .mockResolvedValue(undefined);
    jest.mocked(getLastMci).mockResolvedValue(0);
    jest.mocked(updateLastMci).mockResolvedValue(undefined);
    jest.mocked(snapshot.utils.subgraphRequest).mockResolvedValue({
      messages: [
        { id: '1', mci: 1, type: 'proposal', space: 's' },
        { id: '2', mci: 2, type: 'proposal', space: 's' }
      ]
    });
    let scheduled = false;
    const timeout = jest.spyOn(global, 'setTimeout').mockImplementation(((
      callback: () => void
    ) => {
      if (!scheduled) {
        scheduled = true;
        queueMicrotask(callback);
      }
      return { unref: jest.fn() } as unknown as NodeJS.Timeout;
    }) as typeof setTimeout);

    start();
    await new Promise(resolve => setImmediate(resolve));
    expect(handleCreatedEvent).toHaveBeenCalledTimes(1);

    const stopped = stop();
    index();
    await stopped;

    expect(handleCreatedEvent).toHaveBeenCalledTimes(1);
    expect(updateLastMci).toHaveBeenCalledWith(1);
    timeout.mockRestore();
  });
});
