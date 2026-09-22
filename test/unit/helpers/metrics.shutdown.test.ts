jest.mock('@snapshot-labs/snapshot-metrics', () => {
  const gauges: any[] = [];
  return {
    __esModule: true,
    default: jest.fn(() => ({ stop: jest.fn() })),
    gauges,
    client: {
      Gauge: jest.fn(function (config) {
        gauges.push(config);
        return config;
      }),
      Histogram: jest.fn(function (config) {
        return config;
      })
    }
  };
});
jest.mock('@snapshot-labs/snapshot-sentry', () => ({ capture: jest.fn() }));
jest.mock('../../../src/db', () => {
  const $count = jest.fn();
  return { __esModule: true, $count, db: { $count, $client: {} } };
});

import init from '@snapshot-labs/snapshot-metrics';
import * as metricsPackage from '@snapshot-labs/snapshot-metrics';
import * as dbModule from '../../../src/db';
import initMetrics from '../../../src/helpers/metrics';

const { $count } = dbModule as unknown as { $count: jest.Mock };

describe('metrics shutdown', () => {
  it('waits for an active database collection', async () => {
    let resolveCount: (value: number) => void = () => undefined;
    const counting = new Promise<number>(resolve => {
      resolveCount = resolve;
    });
    $count.mockImplementationOnce(() => counting).mockResolvedValue(2);

    const metrics = initMetrics({} as never);
    const subscribersGauge = (metricsPackage as any).gauges[1];
    const collection = subscribersGauge.collect.call({ set: jest.fn() });
    let stopped = false;
    const draining = metrics.stop().then(() => {
      stopped = true;
    });

    await Promise.resolve();
    expect(stopped).toBe(false);
    expect(jest.mocked(init).mock.results[0].value.stop).toHaveBeenCalled();

    resolveCount(1);
    await collection;
    await draining;
    expect(stopped).toBe(true);
  });
});
