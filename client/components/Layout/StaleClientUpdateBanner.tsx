import { useStaleBundlePrompt } from '../../hooks/useStaleBundlePrompt';

type StaleClientUpdateBannerProps = {
  appVersion: string;
};

export function StaleClientUpdateBanner({ appVersion }: StaleClientUpdateBannerProps) {
  const bundleStale = useStaleBundlePrompt(appVersion);

  if (!bundleStale) {
    return null;
  }

  return (
    <div
      className="pointer-events-none fixed inset-x-4 bottom-[calc(1.25rem+env(safe-area-inset-bottom,0px))] z-[100] sm:inset-x-auto sm:right-6 sm:bottom-[calc(1.5rem+env(safe-area-inset-bottom,0px))]"
      role="status"
      aria-live="polite"
    >
      <div className="pointer-events-auto ml-auto max-w-sm rounded-2xl border border-[var(--color-glass-border)] bg-[var(--color-glass)] p-4 shadow-[var(--shadow-panel)] backdrop-blur-xl backdrop-saturate-150">
        <h2 className="text-foreground text-base font-semibold tracking-tight">
          Client out of date
        </h2>
        <p className="text-muted mt-1.5 text-sm leading-snug">
          Please refresh to get the latest version.
        </p>
        <button
          type="button"
          className="btn btn-accent mt-4 w-full text-sm"
          onClick={() => {
            window.location.reload();
          }}
        >
          Refresh now
        </button>
      </div>
    </div>
  );
}
