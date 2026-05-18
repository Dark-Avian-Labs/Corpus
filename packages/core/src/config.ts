import fs from 'fs';
import path from 'path';

import { config as loadEnv } from '@dotenvx/dotenvx';

const projectRoot = process.cwd();
export function resolveEnvFilePath(rootPath: string): string | null {
  const normalizedNodeEnv = (process.env.NODE_ENV ?? '').trim().toLowerCase();

  if (normalizedNodeEnv === 'test') {
    const testPath = path.join(rootPath, '.env.test');
    return fs.existsSync(testPath) ? testPath : null;
  }

  const envFileByMode: Record<string, string> = {
    production: '.env.production',
    development: '.env.development',
  };
  const prioritizedFiles = [
    envFileByMode[normalizedNodeEnv],
    '.env.production',
    '.env.development',
  ].filter((value, index, values): value is string => {
    return typeof value === 'string' && values.indexOf(value) === index;
  });

  for (const fileName of prioritizedFiles) {
    if (!fileName) continue;
    const candidatePath = path.join(rootPath, fileName);
    if (fs.existsSync(candidatePath)) {
      return candidatePath;
    }
  }
  return null;
}

const skipDotenvx = process.env.USE_DOTENVX === 'false';
const envPath = skipDotenvx ? null : resolveEnvFilePath(projectRoot);
if (envPath) {
  try {
    loadEnv({ path: envPath });
  } catch (error) {
    console.error(`[Core Config] Failed to load environment via loadEnv from "${envPath}".`, error);
    throw error;
  }
} else {
  if (skipDotenvx) {
    console.debug('[Core Config] Skipping dotenvx (USE_DOTENVX=false).');
  } else {
    console.debug(
      `[Core Config] No env file resolved for project root "${projectRoot}" (NODE_ENV="${process.env.NODE_ENV ?? ''}").`,
    );
  }
}

export const APP_NAME = 'Codex';
export const CODEX_APP_ID = process.env.APP_ID?.trim().toLowerCase() || 'codex';

const _centralDbPath = process.env.CENTRAL_DB_PATH?.trim();
if (!_centralDbPath) {
  throw new Error('CENTRAL_DB_PATH must be set to an absolute shared SQLite path.');
}
if (!path.isAbsolute(_centralDbPath)) {
  throw new Error('CENTRAL_DB_PATH must be absolute; relative sibling paths are not supported.');
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
