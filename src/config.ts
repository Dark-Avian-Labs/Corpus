import { config as loadEnv } from '@dotenvx/dotenvx';
import path from 'path';

const projectRoot = process.cwd();
loadEnv({ path: path.join(projectRoot, '.env') });

export const APP_NAME = process.env.APP_NAME ?? 'Epic7 Collection Tracker';
export const AUTH_LOCKOUT_FILE = path.resolve(
  process.env.AUTH_LOCKOUT_FILE ?? './data/lockout.json',
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
export const CSV_IMPORT_DIR = path.resolve(
  process.env.CSV_IMPORT_DIR ?? './import',
);
export const CSV_DELIMITER = (process.env.CSV_DELIMITER ?? ';') as string;
export const DEBUG_MODE =
  process.env.DEBUG_MODE === 'true' || process.env.DEBUG_MODE === '1';
export const IMPORT_DEFAULT_ADMIN_USERNAME =
  process.env.IMPORT_DEFAULT_ADMIN_USERNAME ?? 'admin';
export const IMPORT_DEFAULT_ADMIN_PASSWORD =
  process.env.IMPORT_DEFAULT_ADMIN_PASSWORD ?? 'admin';

export const HERO_CLASSES = [
  'warrior',
  'knight',
  'thief',
  'ranger',
  'mage',
  'soulweaver',
] as const;
export const ARTIFACT_CLASSES = [
  'warrior',
  'knight',
  'thief',
  'ranger',
  'mage',
  'soulweaver',
  'universal',
] as const;
export const ELEMENTS = ['fire', 'ice', 'earth', 'light', 'dark'] as const;
export const HERO_RATINGS = [
  '-',
  'D',
  'C',
  'B',
  'A',
  'S',
  'SS',
  'SSS',
] as const;
export const ARTIFACT_GAUGE_MAX = 5;
export const ARTIFACT_GAUGE_FILLED = '▰';
export const ARTIFACT_GAUGE_EMPTY = '▱';
export const STAR_RATINGS = [3, 4, 5] as const;

export const CLASS_DISPLAY_NAMES: Record<string, string> = {
  knight: 'Knight',
  warrior: 'Warrior',
  thief: 'Thief',
  ranger: 'Ranger',
  mage: 'Mage',
  soulweaver: 'Soul Weaver',
  universal: 'Universal',
};

export const ELEMENT_DISPLAY_NAMES: Record<string, string> = {
  fire: 'Fire',
  ice: 'Ice',
  earth: 'Earth',
  light: 'Light',
  dark: 'Dark',
};

export const RATING_COLORS: Record<string, string> = {
  '-': '#6b7280',
  D: '#06b6d4',
  C: '#22c55e',
  B: '#3b82f6',
  A: '#a855f7',
  S: '#eab308',
  SS: '#f97316',
  SSS: '#ef4444',
};

export const GAUGE_COLORS: Record<number, string> = {
  0: '#6b7280',
  1: '#3b82f6',
  2: '#22c55e',
  3: '#eab308',
  4: '#f97316',
  5: '#ef4444',
};
