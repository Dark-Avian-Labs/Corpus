import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import type { AuthState } from './types';
import { apiFetch, clearCsrfToken } from '../../utils/api';

interface AuthContextValue {
  auth: AuthState;
  refresh: () => Promise<void>;
  logout: (next?: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const DEFAULT_AUTH_STATE: AuthState = {
  status: 'loading',
  user: null,
  apps: [],
};

function isSafeRelativePath(next: string): boolean {
  return (
    next.startsWith('/') &&
    !next.startsWith('//') &&
    !next.includes('//') &&
    !/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(next)
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState>(DEFAULT_AUTH_STATE);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/me');
      if (!response.ok) {
        setAuth({ status: 'unauthenticated', user: null, apps: [] });
        return;
      }
      const body = (await response.json()) as {
        authenticated?: boolean;
        user?: {
          id: number;
          username: string;
          is_admin: boolean;
          avatar: number;
          app: string;
        };
        apps?: {
          id: string;
          label: string;
          subtitle: string;
          url: string;
        }[];
      };
      if (!body.authenticated || !body.user) {
        setAuth({ status: 'unauthenticated', user: null, apps: [] });
        return;
      }
      setAuth({
        status: 'ok',
        user: body.user,
        apps: Array.isArray(body.apps) ? body.apps : [],
      });
    } catch {
      setAuth({ status: 'error', user: null, apps: [] });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const logout = useCallback(async (next?: string) => {
    const redirect = next && isSafeRelativePath(next) ? next : '/login';
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } finally {
      clearCsrfToken();
      window.location.href = redirect;
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ auth, refresh, logout }),
    [auth, refresh, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
