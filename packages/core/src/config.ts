import { config as loadEnv } from '@dotenvx/dotenvx';
import path from 'path';

const projectRoot = process.cwd();
loadEnv({ path: path.join(projectRoot, '.env') });

export const APP_NAME = 'Corpus';
export const AUTH_LOCKOUT_FILE = path.resolve(
  process.env.AUTH_LOCKOUT_FILE ?? './data/auth-lockout.json',
);
const _authMaxAttempts = parseInt(process.env.AUTH_MAX_ATTEMPTS ?? '5', 10);
export const AUTH_MAX_ATTEMPTS =
  Number.isInteger(_authMaxAttempts) && _authMaxAttempts > 0
    ? _authMaxAttempts
    : 5;

const _authLockoutMinutes = parseInt(
  process.env.AUTH_LOCKOUT_MINUTES ?? '15',
  10,
);
export const AUTH_LOCKOUT_MINUTES =
  Number.isFinite(_authLockoutMinutes) &&
  Number.isInteger(_authLockoutMinutes) &&
  _authLockoutMinutes > 0
    ? _authLockoutMinutes
    : 15;

const _authAttemptWindowMinutes = parseInt(
  process.env.AUTH_ATTEMPT_WINDOW_MINUTES ?? '15',
  10,
);
export const AUTH_ATTEMPT_WINDOW_MINUTES =
  Number.isFinite(_authAttemptWindowMinutes) &&
  Number.isInteger(_authAttemptWindowMinutes) &&
  _authAttemptWindowMinutes > 0
    ? _authAttemptWindowMinutes
    : 15;
export const AUTH_ATTEMPT_WINDOW_SECONDS = AUTH_ATTEMPT_WINDOW_MINUTES * 60;

const _centralDbPath = process.env.CENTRAL_DB_PATH?.trim();
if (!_centralDbPath) {
  throw new Error(
    'CENTRAL_DB_PATH must be set to an absolute shared SQLite path.',
  );
}
if (!path.isAbsolute(_centralDbPath)) {
  throw new Error(
    'CENTRAL_DB_PATH must be absolute; relative sibling paths are not supported.',
  );
}
export const CENTRAL_DB_PATH = _centralDbPath;

const _COOKIE_DOMAIN = process.env.COOKIE_DOMAIN;
if (!_COOKIE_DOMAIN) {
  throw new Error('COOKIE_DOMAIN must be set.');
}
export const COOKIE_DOMAIN: string = _COOKIE_DOMAIN;

const _BASE_HOST = process.env.BASE_HOST;
if (!_BASE_HOST) {
  throw new Error('BASE_HOST must be set.');
}
export const BASE_HOST: string = _BASE_HOST;

export const AUTH_SERVICE_URL: string = (() => {
  const value = (process.env.AUTH_SERVICE_URL ?? '').replace(/\/+$/, '');

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' || !parsed.hostname) {
      throw new Error();
    }
  } catch {
    throw new Error(
      'AUTH_SERVICE_URL must be a valid absolute https URL with a non-empty hostname.',
    );
  }

  return value;
})();

export const GAME_HOSTS: Record<string, string> = (() => {
  const raw = process.env.GAME_HOSTS;
  if (!raw) return {};
  const out: Record<string, string> = {};
  for (const pair of raw.split(',')) {
    const trimmed = pair.trim();
    if (trimmed.split('=').length !== 2) {
      if (trimmed) {
        console.warn(
          '[config] GAME_HOSTS: entry must have exactly one "=" (host=gameId), got:',
          trimmed,
        );
      }
      continue;
    }
    const parts = trimmed.split('=', 2).map((s) => s.trim());
    const [host, gameId] = parts;
    if (host && gameId) {
      out[host] = gameId;
    } else if (trimmed) {
      console.warn(
        '[config] GAME_HOSTS: skipping malformed entry (expected host=gameId):',
        trimmed,
      );
    }
  }
  return out;
})();
