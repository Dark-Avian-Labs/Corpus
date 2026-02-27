import type { Request } from 'express';

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
  const fallbackNext = isSafeRelativePath(req.originalUrl) ? req.originalUrl : '/';
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
