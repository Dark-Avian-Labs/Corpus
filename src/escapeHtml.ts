/**
 * Escapes HTML special characters in a value for safe insertion into HTML.
 * Converts null/undefined to empty string; escapes &, <, >, ", and ' for attribute safety.
 */
export function escapeHtml(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
