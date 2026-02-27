import type { Request } from 'express';

import { APP_PUBLIC_BASE_URL, AUTH_SERVICE_URL } from '../config.js';

function isSafeRelativePath(next: string): boolean {
  return (
    next.startsWith('/') &&
    !next.startsWith('//') &&
    !next.includes('//') &&
    !/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(next)
  );
}

export function buildAuthLoginUrl(req: Request): string {
  const requested =
    typeof req.query?.next === 'string' && isSafeRelativePath(req.query.next)
      ? req.query.next
      : req.originalUrl || '/';
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
