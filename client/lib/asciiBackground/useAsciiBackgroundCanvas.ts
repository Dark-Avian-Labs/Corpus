import { type RefObject, useEffect } from 'react';

import {
  applyCascadiaTypographyToContext,
  DEFAULT_CASCADIA_TYPOGRAPHY,
} from './cascadiaCanvasTypography';
import { drawAsciiOverlayFrame, phaseFromClock } from './drawAsciiOverlayFrame';

const PERIOD_SEC = 22;
const ANGLE_DEG = 135;

function readAsciiCanvasColors(): { fgA: string; fgB: string; fgMask: string } {
  const root = getComputedStyle(document.documentElement);
  let fgA = root.getPropertyValue('--ascii-canvas-fg').trim();
  let fgB = root.getPropertyValue('--ascii-canvas-fg-bright').trim();
  const fgMask =
    root.getPropertyValue('--ascii-canvas-fg-accent').trim() ||
    'color-mix(in oklab, #ff0000 12%, transparent)';
  if (!fgA) {
    fgA = 'rgba(200,200,200,0.35)';
  }
  if (!fgB) {
    fgB = 'rgba(255,255,255,0.5)';
  }
  return { fgA, fgB, fgMask };
}

export function useAsciiBackgroundCanvas(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  asciiRows: string[],
  asciiRowsAlt: string[],
  options?: { direction?: 'down' | 'up'; asciiMaskRows?: string[] },
): void {
  const direction = options?.direction ?? 'down';
  const asciiMaskRows = options?.asciiMaskRows;

  useEffect(() => {
    const rows = asciiRows.length;
    const cols =
      rows === 0
        ? 0
        : Math.max(...asciiRows.map((r) => r.length), ...asciiRowsAlt.map((r) => r.length));
    if (rows === 0 || cols === 0) {
      return undefined;
    }

    const canvas = canvasRef.current;
    if (!canvas) {
      return undefined;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return undefined;
    }

    const prefersReduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const typography = DEFAULT_CASCADIA_TYPOGRAPHY;
    const dpiScale = window.devicePixelRatio || 1;

    ctx.imageSmoothingEnabled = false;
    applyCascadiaTypographyToContext(ctx, typography);
    const cellW = Math.max(1, Math.ceil(ctx.measureText('M').width));
    const cellH = Math.ceil(typography.lineHeightPx);
    const w = cols * cellW;
    const h = rows * cellH;

    canvas.width = Math.floor(w * dpiScale);
    canvas.height = Math.floor(h * dpiScale);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpiScale, 0, 0, dpiScale, 0, 0);
    applyCascadiaTypographyToContext(ctx, typography);

    const t0 = performance.now();

    const paint = (now: number) => {
      const { fgA, fgB, fgMask } = readAsciiCanvasColors();
      const phase = phaseFromClock(now, t0, PERIOD_SEC, direction);
      drawAsciiOverlayFrame(
        ctx,
        asciiRows,
        asciiRowsAlt,
        cols,
        rows,
        cellW,
        cellH,
        w,
        h,
        phase,
        ANGLE_DEG,
        fgA,
        fgB,
        fgMask,
        asciiMaskRows,
      );
    };

    if (prefersReduce) {
      paint(performance.now());
      return undefined;
    }

    let raf = 0;
    const tick = (t: number) => {
      paint(t);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [asciiRows, asciiRowsAlt, asciiMaskRows, direction]);
}
