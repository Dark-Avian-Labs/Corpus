import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import type { AuthErrorDetail, AuthState, UserSummary } from './types';
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
  const trimmed = next.trim();
  if (trimmed.length !== next.length) {
    return false;
  }
  if (trimmed.includes('\\') || /[\u0000-\u001f\u007f]/.test(trimmed)) {
    return false;
  }

  return (
    trimmed.startsWith('/') &&
    !trimmed.startsWith('//') &&
    !trimmed.includes('//') &&
    !/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(trimmed)
  );
}

function toAuthErrorDetail(error: unknown): AuthErrorDetail {
  if (error instanceof Error || typeof error === 'string') {
    return error;
  }
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    const code = (error as { code?: unknown }).code;
    if (typeof message === 'string') {
      return {
        message,
        ...(typeof code === 'string' ? { code } : {}),
      };
    }
  }
  return { message: 'Unable to refresh authentication state.' };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState>(DEFAULT_AUTH_STATE);

  const refresh = useCallback(async () => {
    try {
      const response = await apiFetch('/api/auth/me');
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
      const user: UserSummary = {
        ...body.user,
        isAdmin: body.user.is_admin,
      };
      setAuth({
        status: 'ok',
        user,
        apps: Array.isArray(body.apps) ? body.apps : [],
      });
    } catch (error) {
      setAuth({
        status: 'error',
        user: null,
        apps: [],
        error: toAuthErrorDetail(error),
      });
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
