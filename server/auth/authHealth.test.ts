import { afterEach, describe, expect, it, vi } from 'vitest';

import { pingAuthServiceHealth } from './authHealth.js';

describe('pingAuthServiceHealth', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns true when auth healthz responds ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ status: 'ok' }), { status: 200 })),
    );
    await expect(pingAuthServiceHealth('https://auth.example.com')).resolves.toBe(true);
  });

  it('returns false for malformed URLs without calling fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(pingAuthServiceHealth('not-a-url')).resolves.toBe(false);
    await expect(pingAuthServiceHealth('ftp://auth.example.com')).resolves.toBe(false);
    await expect(pingAuthServiceHealth('https://')).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns false when fetch throws', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('down');
      }),
    );
    await expect(pingAuthServiceHealth('https://auth.example.com')).resolves.toBe(false);
  });
});
