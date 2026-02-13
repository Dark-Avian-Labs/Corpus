/**
 * Returns a safe URL for use in href. Allows relative paths (/, ./) and http(s) only.
 * Prevents protocol-based XSS (e.g. javascript:, data:). Invalid values return '#'.
 */
export function sanitizeGamePath(raw: string | null | undefined): string {
  if (raw == null || typeof raw !== 'string') return '#';
  const s = raw.trim();
  if (s === '') return '#';
  if (s.startsWith('/') && !s.startsWith('//')) return s;
  if (s.startsWith('./')) return s;
  const lower = s.toLowerCase();
  if (lower.startsWith('https://') || lower.startsWith('http://')) return s;
  return '#';
}
