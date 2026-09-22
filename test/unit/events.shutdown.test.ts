jest.mock('@snapshot-labs/snapshot-sentry', () => ({ capture: jest.fn() }));
jest.mock('@snapshot-labs/snapshot.js', () => ({
  __esModule: true,
  default: { utils: { ipfsGet: jest.fn() } }
}));
jest.mock('../../src/db', () => {
  const findMany = jest.fn();
  const deleteWhere = jest.fn();
  return {
    __esModule: true,
    findMany,
    deleteWhere,
    db: {
      query: { events: { findMany } },
      delete: () => ({ where: deleteWhere })
    }
  };
});
jest.mock('../../src/helpers/utils', () => ({
  getProposal: jest.fn(),
  getSubscribers: jest.fn().mockResolvedValue([])
}));
jest.mock('../../src/providers', () => ({
  __esModule: true,
  default: [jest.fn()]
}));

import * as dbModule from '../../src/db';
import { start, stop } from '../../src/events';
import { getSubscribers } from '../../src/helpers/utils';
import providers from '../../src/providers';

const { findMany, deleteWhere } = dbModule as unknown as {
  findMany: jest.Mock;
  deleteWhere: jest.Mock;
};

describe('events shutdown', () => {
  it('does not start another event after stop', async () => {
    let deliver: () => void = () => undefined;
    const delivery = new Promise<void>(resolve => {
      deliver = resolve;
    });
    const provider = providers[0] as jest.Mock;
    provider
      .mockImplementationOnce(() => delivery)
      .mockResolvedValue(undefined);
    jest.mocked(getSubscribers).mockResolvedValue([]);
    findMany.mockResolvedValue([
      { id: 'proposal/1', event: 'proposal/deleted', space: 's' },
      { id: 'proposal/2', event: 'proposal/deleted', space: 's' }
    ]);
    deleteWhere.mockResolvedValue(undefined);
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
    expect(provider).toHaveBeenCalledTimes(1);
    expect(deleteWhere).not.toHaveBeenCalled();

    const stopped = stop();
    deliver();
    await stopped;

    expect(provider).toHaveBeenCalledTimes(1);
    expect(deleteWhere).toHaveBeenCalledTimes(1);
    timeout.mockRestore();
  });
});
