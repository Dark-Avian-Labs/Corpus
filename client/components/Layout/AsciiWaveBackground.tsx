import { useEffect, useRef, type CSSProperties } from 'react';

import bgArt from '../../../packages/core/assets/background.txt?raw';
import bgArt2 from '../../../packages/core/assets/background2.txt?raw';

export function AsciiWaveBackground() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return undefined;
    }

    const el = rootRef.current;
    if (!el) {
      return undefined;
    }

    const periodMs = 22_000;
    const pMin = 0.08;
    const pMax = 0.92;
    const t0 = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      const t = ((now - t0) % periodMs) / periodMs;
      const p = pMin + t * (pMax - pMin);
      el.style.setProperty('--bg-art-wave-p', p.toFixed(5));
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div
      ref={rootRef}
      className="bg-art bg-art--wave"
      aria-hidden="true"
      style={{ '--bg-art-wave-p': 0.08 } as CSSProperties}
    >
      <pre className="bg-art__layer bg-art__layer--base">{bgArt}</pre>
      <pre className="bg-art__layer bg-art__layer--alt">{bgArt2}</pre>
    </div>
  );
}
