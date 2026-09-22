import http from 'http';
import { capture } from '@snapshot-labs/snapshot-sentry';
import express from 'express';
import api from '../../src/api';
import { sendEvent } from '../../src/providers/webhook';

jest.mock('@snapshot-labs/snapshot-sentry', () => ({ capture: jest.fn() }));
jest.mock('../../src/providers/webhook', () => ({ sendEvent: jest.fn() }));

const mockSendEvent = sendEvent as jest.Mock;
let server: http.Server;

const get = (path: string) =>
  new Promise<{ status: number; body: any }>((resolve, reject) => {
    const { port } = server.address() as any;
    http
      .get(`http://127.0.0.1:${port}${path}`, res => {
        let body = '';
        res.on('data', chunk => (body += chunk));
        res.on('end', () =>
          resolve({ status: res.statusCode as number, body: JSON.parse(body) })
        );
      })
      .on('error', reject);
  });

beforeAll(done => {
  server = express().use('/api', api).listen(0, done);
});

afterAll(done => {
  server.close(done);
});

describe('GET /api/test', () => {
  it('reports success when the webhook is delivered', async () => {
    mockSendEvent.mockResolvedValueOnce(true);

    const { status, body } = await get(
      '/api/test?url=https%3A%2F%2Fexample.com'
    );

    expect(status).toBe(200);
    expect(body).toEqual({ url: 'https://example.com', success: true });
    expect(mockSendEvent).toHaveBeenCalledWith(
      expect.anything(),
      'https://example.com',
      'POST'
    );
    expect(capture).not.toHaveBeenCalled();
  });

  // Every failure here is caused by the caller's URL, never by the service,
  // so none of them belong in Sentry. Unusable input is a 400, a failed
  // delivery to a usable URL is a 500.
  it.each([
    [400, 'invalid url', 'not a url', null],
    [
      500,
      'unreachable host',
      'http://127.0.0.1:1',
      Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:1'), {
        name: 'FetchError',
        code: 'ECONNREFUSED'
      })
    ],
    [
      400,
      'non-http scheme',
      'ftp://example.com',
      new TypeError('Only HTTP(S) protocols are supported')
    ],
    [
      400,
      'url without hostname',
      'file:///tmp/x',
      new TypeError('Only absolute URLs are supported')
    ],
    [
      500,
      'timeout',
      'https://example.com',
      new Error('Request timeout after 15000ms')
    ]
  ])(
    'returns %i for a caller %s without reporting to sentry',
    async (expected, _, url, err) => {
      if (err) mockSendEvent.mockRejectedValueOnce(err);

      const { status, body } = await get(
        `/api/test?url=${encodeURIComponent(url)}`
      );

      expect(status).toBe(expected);
      expect(body).toEqual({ url, error: expect.anything() });
      expect(capture).not.toHaveBeenCalled();
    }
  );
});
