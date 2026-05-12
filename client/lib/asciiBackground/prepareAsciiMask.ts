function splitLines(raw: string): string[] {
  return raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
}

/**
 * Trims trailing spaces on each line, drops trailing all-blank rows, then pads
 * the mask to the same width/height as the ASCII grid. Whitespace in the mask
 * means "do not tint"; any other character marks the cell for highlight.
 */
export function prepareAsciiMask(raw: string, gridRows: string[]): string[] {
  const lines = splitLines(raw).map((line) => line.trimEnd());
  while (lines.length > 0 && lines[lines.length - 1]!.trim() === '') {
    lines.pop();
  }

  const h = gridRows.length;
  const w = h === 0 ? 0 : Math.max(0, ...gridRows.map((r) => r.length));

  return Array.from({ length: h }, (_, i) => (lines[i] ?? '').padEnd(w, ' '));
}
