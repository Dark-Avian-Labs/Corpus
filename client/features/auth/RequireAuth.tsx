import { useEffect, type ReactNode } from 'react';
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

function toErrorMessage(error: Error | string | { message: string; code?: string }) {
  if (typeof error === 'string') {
    return error;
  }
  if (error instanceof Error) {
    return error.message || 'Authentication error';
  }
  return error.code ? `${error.message} (${error.code})` : error.message;
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { auth } = useAuth();
  const location = useLocation();
  const next = safeRedirectPath(
    `${location.pathname}${location.search}${location.hash}`,
  );

  useEffect(() => {
    if (auth.status !== 'loading' && auth.status !== 'ok') {
      window.location.href = `/auth/login?next=${encodeURIComponent(next)}`;
    }
  }, [auth.status, next]);

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
      <div
        className="flex min-h-screen items-center justify-center"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <p className="text-muted">
          Session check failed: {toErrorMessage(auth.error)}. Redirecting to secure
          login...
        </p>
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
