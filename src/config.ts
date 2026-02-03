import { config as loadEnv } from '@dotenvx/dotenvx';
import path from 'path';

const projectRoot = process.cwd();
loadEnv({ path: path.join(projectRoot, '.env') });

export const APP_NAME = process.env.APP_NAME ?? 'Warframe Collection Tracker';
export const AUTH_LOCKOUT_FILE = path.resolve(
  process.env.AUTH_LOCKOUT_FILE ?? './data/auth-lockout.json',
);
export const AUTH_MAX_ATTEMPTS = parseInt(
  process.env.AUTH_MAX_ATTEMPTS ?? '5',
  10,
);
export const AUTH_LOCKOUT_MINUTES = parseInt(
  process.env.AUTH_LOCKOUT_MINUTES ?? '15',
  10,
);
export const SQLITE_DB_PATH = path.resolve(
  process.env.SQLITE_DB_PATH ?? './data/collection.db',
);
export const DEBUG_MODE =
  process.env.DEBUG_MODE === 'true' || process.env.DEBUG_MODE === '1';

export const VALID_STATUSES = [
  '',
  'Obtained',
  'Complete',
  'Unavailable',
] as const;
export type ValidStatus = (typeof VALID_STATUSES)[number];

export function isValidStatus(value: string): value is ValidStatus {
  return (VALID_STATUSES as readonly string[]).includes(value);
}

/** Allowed values for the Helminth (yes/no) column on Warframes. */
export const HELMINTH_VALUES = ['', 'Yes'] as const;
export type HelminthValue = (typeof HELMINTH_VALUES)[number];

export function isHelminthValue(value: string): value is HelminthValue {
  return (HELMINTH_VALUES as readonly string[]).includes(value);
}
