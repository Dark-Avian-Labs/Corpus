import path from 'path';

const dataDir = process.env.DATA_DIR ?? './data';
export const WARFRAME_DB_PATH = path.resolve(
  process.env.WARFRAME_DB_PATH ?? path.join(dataDir, 'warframe.db'),
);

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

export const HELMINTH_VALUES = ['', 'Yes'] as const;
export type HelminthValue = (typeof HELMINTH_VALUES)[number];

export function isHelminthValue(value: string): value is HelminthValue {
  return (HELMINTH_VALUES as readonly string[]).includes(value);
}
