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
  const hasControlCharacters = Array.from(trimmed).some((char) => {
    const codePoint = char.codePointAt(0);
    return (
      typeof codePoint === 'number' && (codePoint <= 31 || codePoint === 127)
    );
  });
  if (trimmed.includes('\\') || hasControlCharacters) {
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

async function getRetryAfterMs(response: Response): Promise<number | null> {
  const header = response.headers.get('Retry-After');
  if (header) {
    const asSeconds = Number.parseInt(header, 10);
    if (Number.isFinite(asSeconds) && asSeconds > 0) {
      return asSeconds * 1000;
    }
    const asDate = Date.parse(header);
    if (Number.isFinite(asDate)) {
      const delta = asDate - Date.now();
      if (delta > 0) return delta;
    }
  }

  try {
    const body = (await response.clone().json()) as {
      auth_retry_after_sec?: number;
      retry_after_sec?: number;
    };
    const sec = body.auth_retry_after_sec ?? body.retry_after_sec;
    if (typeof sec === 'number' && Number.isFinite(sec) && sec > 0) {
      return sec * 1000;
    }
  } catch {
    // ignore parse errors
  }

  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState>(DEFAULT_AUTH_STATE);

  const refresh = useCallback(async () => {
    try {
      const response = await apiFetch('/api/auth/me');
      if (!response.ok) {
        if (response.status === 429) {
          const retryAfterMs = (await getRetryAfterMs(response)) ?? 30000;
          setAuth({
            status: 'rate_limited',
            user: null,
            apps: [],
            rateLimitedUntilMs: Date.now() + retryAfterMs,
          });
          return;
        }
        setAuth({ status: 'unauthenticated', user: null, apps: [] });
        return;
      }
      const body = (await response.json()) as {
        authenticated?: boolean;
        has_game_access?: boolean;
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
      if (body.has_game_access === false) {
        setAuth({ status: 'forbidden', user: null, apps: [] });
        return;
      }
      const user: UserSummary = {
        id: body.user.id,
        username: body.user.username,
        isAdmin: body.user.is_admin,
        avatar: body.user.avatar,
        app: body.user.app,
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
