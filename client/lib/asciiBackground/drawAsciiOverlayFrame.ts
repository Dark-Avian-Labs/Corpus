import { altBlend, cssLinearGradientT, SCAN_BAND_FEATHER, SCAN_BAND_HALF } from './diagonalScan';

export function phaseFromClock(
  now: number,
  t0: number,
  periodSec: number,
  direction: 'down' | 'up',
): number {
  const periodMs = periodSec * 1000;
  let p = ((now - t0) % periodMs) / periodMs;
  if (direction === 'up') {
    p = 1 - p;
  }
  return p;
}

export function drawAsciiOverlayFrame(
  ctx: CanvasRenderingContext2D,
  asciiRows: string[],
  asciiRowsAlt: string[],
  cols: number,
  rows: number,
  cellW: number,
  cellH: number,
  w: number,
  h: number,
  phase: number,
  angleDeg: number,
  fgA: string,
  fgB: string,
  fgMask: string,
  asciiMaskRows?: string[],
): void {
  ctx.clearRect(0, 0, w, h);
  ctx.globalAlpha = 1;

  for (let r = 0; r < rows; r++) {
    const y = r * cellH;
    const rowBase = asciiRows[r] ?? '';
    ctx.fillStyle = fgA;
    for (let c = 0; c < cols; c++) {
      const ch = rowBase[c] ?? ' ';
      ctx.fillText(ch, c * cellW, y);
    }
  }

  for (let r = 0; r < rows; r++) {
    const y = r * cellH;
    const rowBase = asciiRows[r] ?? '';
    const rowAlt = asciiRowsAlt[r] ?? '';
    for (let c = 0; c < cols; c++) {
      const t = cssLinearGradientT(c, r, cols, rows, angleDeg);
      const blend = altBlend(t, phase, SCAN_BAND_HALF, SCAN_BAND_FEATHER);
      if (blend <= 0.001) {
        continue;
      }
      const bc = rowBase[c] ?? ' ';
      const ac = rowAlt[c] ?? ' ';
      if (ac === bc) {
        continue;
      }
      ctx.globalAlpha = blend;
      const maskCh = asciiMaskRows?.[r]?.[c] ?? ' ';
      const useMaskColor = /\S/.test(maskCh);
      ctx.fillStyle = useMaskColor ? fgMask : fgB;
      ctx.fillText(ac, c * cellW, y);
    }
  }
  ctx.globalAlpha = 1;
}
