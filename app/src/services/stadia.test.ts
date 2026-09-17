import { afterEach, describe, expect, it, vi } from 'vitest';

import { StadiaError, stadiaGet } from './stadia';

function mockFetchOnce(status: number, body: unknown = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    }),
  );
}

describe('stadiaGet', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the parsed body on success', async () => {
    mockFetchOnce(200, { hello: 'world' });
    const data = await stadiaGet<{ hello: string }>('/x', {});
    expect(data).toEqual({ hello: 'world' });
  });

  it('reports a rate-limit response as an expected, calm message, not a raw status code', async () => {
    // 429 is what a shared, keyless free-tier quota returns once it's spent
    // for the month: this is the demo's normal failure mode, not a bug, so
    // the message must say so instead of surfacing "Error 429".
    mockFetchOnce(429);
    await expect(stadiaGet('/geocoding/v1/autocomplete', {})).rejects.toMatchObject({
      name: 'StadiaError',
      status: 429,
      message: 'Demo search limit reached for now, try again later',
    });
  });

  it('reports 401/403 as a domain-authorization hint', async () => {
    mockFetchOnce(403);
    await expect(stadiaGet('/x', {})).rejects.toMatchObject({
      message: 'Domain not authorized with Stadia Maps',
    });
  });

  it('falls back to a generic status message for anything else', async () => {
    mockFetchOnce(500);
    await expect(stadiaGet('/x', {})).rejects.toMatchObject({ message: 'Error 500' });
  });

  it('lets an AbortError through as-is instead of wrapping it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new DOMException('aborted', 'AbortError')),
    );
    await expect(stadiaGet('/x', {})).rejects.toBeInstanceOf(DOMException);
  });

  it('wraps other network failures as "no connection"', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network down')));
    await expect(stadiaGet('/x', {})).rejects.toEqual(new StadiaError('No connection'));
  });
});
