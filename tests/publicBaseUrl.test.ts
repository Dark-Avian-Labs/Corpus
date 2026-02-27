import { describe, expect, it } from 'vitest';

describe('getAppPublicBaseUrl', () => {
  it('prefers explicit APP_PUBLIC_BASE_URL', async () => {
    const originalBaseUrl = process.env.APP_PUBLIC_BASE_URL;
    const originalCookieDomain = process.env.COOKIE_DOMAIN;
    const originalBaseHost = process.env.BASE_HOST;
    const originalAuthUrl = process.env.AUTH_SERVICE_URL;
    process.env.APP_PUBLIC_BASE_URL = 'https://corpus.example.com/';
    process.env.COOKIE_DOMAIN = '.example.com';
    process.env.BASE_HOST = 'corpus.example.com';
    process.env.AUTH_SERVICE_URL = 'https://auth.example.com';
    try {
      const { getAppPublicBaseUrl } =
        await import('../packages/core/src/middleware/auth.js');
      expect(getAppPublicBaseUrl()).toBe('https://corpus.example.com');
    } finally {
      process.env.APP_PUBLIC_BASE_URL = originalBaseUrl;
      process.env.COOKIE_DOMAIN = originalCookieDomain;
      process.env.BASE_HOST = originalBaseHost;
      process.env.AUTH_SERVICE_URL = originalAuthUrl;
    }
  });
});
