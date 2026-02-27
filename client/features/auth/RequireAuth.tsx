import { useEffect, type ReactElement } from 'react';
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

export function RequireAuth({ children }: { children: ReactElement }) {
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
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted">Checking session...</p>
      </div>
    );
  }

  if (auth.status !== 'ok') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted">Redirecting to secure login...</p>
      </div>
    );
  }

  return children;
}
