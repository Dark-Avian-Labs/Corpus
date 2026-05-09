import { useEffect, useState } from 'react';

export function useStaleBundlePrompt(bundleVersion: string): boolean {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    if (!bundleVersion || bundleVersion === 'dev') {
      return undefined;
    }

    let cancelled = false;

    async function check(): Promise<void> {
      try {
        const response = await fetch('/api/version', { cache: 'no-store' });
        if (!response.ok || cancelled) {
          return;
        }
        const data = (await response.json()) as { version?: unknown };
        const serverVersion = typeof data.version === 'string' ? data.version.trim() : '';
        if (serverVersion.length > 0 && serverVersion !== bundleVersion) {
          setStale(true);
        }
      } catch {
        // ignore
      }
    }

    void check();
    const intervalId = window.setInterval(() => {
      void check();
    }, 60_000);

    const onFocus = (): void => {
      void check();
    };
    window.addEventListener('focus', onFocus);
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') {
        void check();
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [bundleVersion]);

  return stale;
}
