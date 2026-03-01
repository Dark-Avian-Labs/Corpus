import type { Request, Response } from 'express';

import { APP_PUBLIC_BASE_URL, AUTH_SERVICE_URL } from '../config.js';

function isSafeRelativePath(next: string): boolean {
  return (
    next.startsWith('/') &&
    !next.includes('\\') &&
    !next.startsWith('//') &&
    !next.includes('//') &&
    !/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(next)
  );
}

export function buildAuthLoginUrl(req: Request): string {
  const requestedNext =
    typeof req.query?.next === 'string' ? req.query.next : undefined;
  const fallbackNext = isSafeRelativePath(req.originalUrl)
    ? req.originalUrl
    : '/';
  const requested =
    requestedNext && isSafeRelativePath(requestedNext)
      ? requestedNext
      : fallbackNext;
  const next = new URL(requested, APP_PUBLIC_BASE_URL).toString();
  const loginUrl = new URL(`${AUTH_SERVICE_URL}/login`);
  loginUrl.searchParams.set('next', next);
  return loginUrl.toString();
}

export function buildAuthLogoutUrl(next = '/login'): string {
  const safeNext = isSafeRelativePath(next) ? next : '/login';
  const logoutUrl = new URL(`${AUTH_SERVICE_URL}/logout`);
  logoutUrl.searchParams.set(
    'next',
    new URL(safeNext, APP_PUBLIC_BASE_URL).toString(),
  );
  return logoutUrl.toString();
}

export async function proxyAuthLogout(
  req: Request,
  res: Response,
): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    try {
      const csrfResponse = await fetch(`${AUTH_SERVICE_URL}/api/auth/csrf`, {
        method: 'GET',
        headers: {
          cookie: req.headers.cookie ?? '',
          accept: 'application/json',
        },
        signal: controller.signal,
      });
      if (!csrfResponse.ok) {
        return false;
      }
      const csrfBody = (await csrfResponse.json()) as { csrfToken?: string };
      if (!csrfBody.csrfToken) {
        return false;
      }
      const logoutResponse = await fetch(`${AUTH_SERVICE_URL}/api/auth/logout`, {
        method: 'POST',
        headers: {
          cookie: req.headers.cookie ?? '',
          accept: 'application/json',
          'content-type': 'application/json',
          'x-csrf-token': csrfBody.csrfToken,
        },
        body: JSON.stringify({ _csrf: csrfBody.csrfToken }),
        signal: controller.signal,
      });
      const setCookies = (
        logoutResponse.headers as Headers & {
          getSetCookie?: () => string[];
        }
      ).getSetCookie?.();
      if (setCookies && setCookies.length > 0) {
        res.setHeader('set-cookie', setCookies);
      }
      return logoutResponse.ok;
    } catch (error) {
      console.warn('[Auth] Upstream logout request failed:', error);
      return false;
    }
  } finally {
    clearTimeout(timeout);
  }
}
