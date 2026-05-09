function readTrimmedEnv(value: string | undefined, fallback: string): string {
  if (typeof value !== 'string') {
    return fallback;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

export const APP_DISPLAY_NAME = readTrimmedEnv(
  import.meta.env.VITE_APP_NAME as string | undefined,
  'Codex',
);

export const LEGAL_ENTITY_NAME = readTrimmedEnv(
  import.meta.env.VITE_LEGAL_ENTITY_NAME as string | undefined,
  'Dark Avian Labs',
);

let resolvedLegalPageUrl = readTrimmedEnv(
  import.meta.env.VITE_LEGAL_PAGE_URL as string | undefined,
  '/auth/legal',
);
if (resolvedLegalPageUrl === '/legal') {
  resolvedLegalPageUrl = '/auth/legal';
}
const lower = resolvedLegalPageUrl.toLowerCase();
const isSafeRelativePath =
  resolvedLegalPageUrl.startsWith('/') &&
  !resolvedLegalPageUrl.startsWith('//') &&
  !resolvedLegalPageUrl.includes('\\') &&
  !resolvedLegalPageUrl.includes('://') &&
  !lower.startsWith('javascript:') &&
  !lower.startsWith('data:') &&
  !lower.startsWith('vbscript:');

export const LEGAL_PAGE_URL = isSafeRelativePath ? resolvedLegalPageUrl : '/auth/legal';

export const SEARCH_PLACEHOLDER = readTrimmedEnv(
  import.meta.env.VITE_SEARCH_PLACEHOLDER as string | undefined,
  'Search Codex...',
);

export const APP_VERSION = readTrimmedEnv(
  import.meta.env.VITE_APP_VERSION as string | undefined,
  'dev',
);
