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
  new Promise<any>((resolve, reject) => {
    const { port } = server.address() as any;
    http
      .get(`http://127.0.0.1:${port}${path}`, res => {
        let body = '';
        res.on('data', chunk => (body += chunk));
        res.on('end', () => resolve(JSON.parse(body)));
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

    const body = await get('/api/test?url=https%3A%2F%2Fexample.com');

    expect(body).toEqual({ url: 'https://example.com', success: true });
    expect(mockSendEvent).toHaveBeenCalledWith(
      expect.anything(),
      'https://example.com',
      'POST'
    );
    expect(capture).not.toHaveBeenCalled();
  });

  // Every failure here is caused by the caller's URL, never by the service,
  // so none of them belong in Sentry.
  it.each([
    ['invalid url', 'not a url', null],
    [
      'unreachable host',
      'http://127.0.0.1:1',
      Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:1'), {
        name: 'FetchError',
        code: 'ECONNREFUSED'
      })
    ],
    [
      'non-http scheme',
      'ftp://example.com',
      new TypeError('Only HTTP(S) protocols are supported')
    ],
    [
      'url without hostname',
      'file:///tmp/x',
      new TypeError('Only absolute URLs are supported')
    ],
    [
      'timeout',
      'https://example.com',
      new Error('Request timeout after 15000ms')
    ]
  ])('does not report a caller %s to sentry', async (_, url, err) => {
    if (err) mockSendEvent.mockRejectedValueOnce(err);

    const body = await get(`/api/test?url=${encodeURIComponent(url)}`);

    expect(body).toEqual({ url, error: expect.anything() });
    expect(capture).not.toHaveBeenCalled();
  });
});
