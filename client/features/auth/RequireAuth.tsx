import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

import { useAuth } from './AuthContext';

function safeRedirectPath(path: string): string {
  if (
    path.startsWith('/') &&
    !path.startsWith('//') &&
    !/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(path)
  ) {
    return path;
  }
  return '/';
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { auth, refresh, logout } = useAuth();
  const location = useLocation();
  const next = safeRedirectPath(
    `${location.pathname}${location.search}${location.hash}`,
  );
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer =
      auth.status === 'rate_limited'
        ? window.setInterval(() => {
            setNowMs(Date.now());
          }, 1000)
        : null;
    return () => {
      if (timer !== null) {
        window.clearInterval(timer);
      }
    };
  }, [auth.status]);

  const secondsRemaining = useMemo(() => {
    if (auth.status !== 'rate_limited') return 0;
    return Math.max(0, Math.ceil((auth.rateLimitedUntilMs - nowMs) / 1000));
  }, [auth, nowMs]);

  useEffect(() => {
    if (
      auth.status !== 'loading' &&
      auth.status !== 'ok' &&
      auth.status !== 'rate_limited' &&
      auth.status !== 'error' &&
      auth.status !== 'forbidden'
    ) {
      window.location.href = `/auth/login?next=${encodeURIComponent(next)}`;
    }
  }, [auth.status, next]);

  useEffect(() => {
    if (auth.status !== 'rate_limited') return;
    if (secondsRemaining > 0) return;
    void refresh();
  }, [auth.status, secondsRemaining, refresh]);

  if (auth.status === 'loading') {
    return (
      <div
        className="flex min-h-screen items-center justify-center"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <p className="text-muted">Checking session...</p>
      </div>
    );
  }

  if (auth.status === 'error') {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="glass-panel max-w-md p-6 text-center">
          <h1 className="mb-2 text-xl font-semibold text-foreground">
            Auth check failed
          </h1>
          <p className="mb-4 text-sm text-muted">
            We could not verify your session right now. Please try again.
          </p>
          <button
            className="btn btn-accent"
            type="button"
            onClick={() => {
              void refresh();
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (auth.status === 'forbidden') {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="glass-panel max-w-md p-6 text-center">
          <h1 className="mb-2 text-xl font-semibold text-foreground">
            Access denied
          </h1>
          <p className="mb-4 text-sm text-muted">
            Your account is authenticated but does not have access to this
            application.
          </p>
          <button
            className="btn btn-accent"
            type="button"
            onClick={() => {
              void logout();
            }}
          >
            Logout
          </button>
        </div>
      </div>
    );
  }

  if (auth.status === 'rate_limited') {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="glass-panel max-w-md p-6 text-center">
          <h1 className="mb-2 text-xl font-semibold text-foreground">
            Too many requests
          </h1>
          <p className="mb-4 text-sm text-muted">
            Authentication checks are temporarily rate limited. Please wait
            before trying again.
          </p>
          <div className="mb-4 text-2xl font-semibold text-warning">
            {secondsRemaining}s
          </div>
          <button
            className="btn btn-accent"
            type="button"
            onClick={() => {
              void refresh();
            }}
            disabled={secondsRemaining > 0}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (auth.status !== 'ok') {
    return (
      <div
        className="flex min-h-screen items-center justify-center"
        role="status"
        aria-live="assertive"
        aria-atomic="true"
      >
        <p className="text-muted">Redirecting to secure login...</p>
      </div>
    );
  }

  return children;
}
