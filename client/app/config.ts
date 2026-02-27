function readTrimmedEnv(value: string | undefined, fallback: string): string {
  if (typeof value !== 'string') {
    return fallback;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

export const APP_DISPLAY_NAME = readTrimmedEnv(
  import.meta.env.VITE_APP_NAME as string | undefined,
  'Corpus',
);

export const LEGAL_ENTITY_NAME = readTrimmedEnv(
  import.meta.env.VITE_LEGAL_ENTITY_NAME as string | undefined,
  'Dark Avian Labs',
);

const resolvedLegalPageUrl = readTrimmedEnv(
  import.meta.env.VITE_LEGAL_PAGE_URL as string | undefined,
  '/legal',
);
const lower = resolvedLegalPageUrl.toLowerCase();
const isSafeRelativePath =
  resolvedLegalPageUrl.startsWith('/') &&
  !resolvedLegalPageUrl.startsWith('//') &&
  !resolvedLegalPageUrl.includes('://') &&
  !lower.startsWith('javascript:') &&
  !lower.startsWith('data:') &&
  !lower.startsWith('vbscript:');

export const LEGAL_PAGE_URL = isSafeRelativePath
  ? resolvedLegalPageUrl
  : '/legal';

export const SEARCH_PLACEHOLDER = readTrimmedEnv(
  import.meta.env.VITE_SEARCH_PLACEHOLDER as string | undefined,
  'Search Corpus...',
);
