import type { Request, Response, NextFunction } from 'express';

import { type AuthSession } from '../auth.js';
import { AUTH_SERVICE_URL, CODEX_APP_ID } from '../config.js';
import { log } from '../logger.js';
import { getAppPublicBaseUrl } from './appPublicBaseUrl.js';

function getSession(req: Request): AuthSession {
  return req.session as AuthSession;
}

function wantsJson(req: Request): boolean {
  return req.accepts(['html', 'json']) === 'json';
}

function parseRetryAfterSeconds(value: string | null): number | undefined {
  if (!value) return undefined;
  const asNumber = Number.parseInt(value, 10);
  if (Number.isFinite(asNumber) && asNumber > 0) {
    return asNumber;
  }
  const asDateMs = Date.parse(value);
  if (Number.isFinite(asDateMs)) {
    const deltaMs = asDateMs - Date.now();
    if (deltaMs > 0) {
      return Math.ceil(deltaMs / 1000);
    }
  }
  return undefined;
}

function authServiceFailureStatus(state: { auth_rate_limited?: boolean }): number {
  return state.auth_rate_limited ? 429 : 503;
}

function applyAuthServiceRetryHeaders(
  res: Response,
  state: { auth_retry_after_sec?: number },
): void {
  if (
    typeof state.auth_retry_after_sec === 'number' &&
    Number.isFinite(state.auth_retry_after_sec) &&
    state.auth_retry_after_sec > 0
  ) {
    res.setHeader('Retry-After', String(Math.ceil(state.auth_retry_after_sec)));
  }
}

const AUTH_FETCH_TIMEOUT_MS = Number.parseInt(process.env.AUTH_FETCH_TIMEOUT_MS ?? '5000', 10);
const SESSION_TOUCH_INTERVAL_MS = 5 * 60 * 1000;
const AUTH_STATE_CACHE_KEY = Symbol('authStateCache');

function isFetchAborted(err: unknown): boolean {
  if (err instanceof Error) {
    if (err.name === 'AbortError') return true;
    const message = err.message.toLowerCase();
    return message.includes('abort');
  }
  return false;
}

function isClientDisconnected(req: Request): boolean {
  if ('aborted' in req && Boolean((req as Request & { aborted?: boolean }).aborted)) {
    return true;
  }
  return req.socket.destroyed;
}

function createAuthUpstreamSignal(req: Request): {
  signal: AbortSignal;
  cleanup: () => void;
  abortedByTimeout: () => boolean;
} {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, AUTH_FETCH_TIMEOUT_MS);
  const onClose = () => controller.abort();
  req.once('close', onClose);
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeout);
      req.off('close', onClose);
    },
    abortedByTimeout: () => timedOut,
  };
}

function getLoginRedirectUrl(req: Request, gameId?: string): string {
  const nextPath = gameId ? `/games/${gameId}` : req.originalUrl || '/';
  const next = new URL(nextPath, getAppPublicBaseUrl()).toString();
  const authUrl = new URL(`${AUTH_SERVICE_URL}/login`);
  authUrl.searchParams.set('next', next);
  return authUrl.toString();
}

export type RemoteAuthState = {
  authenticated: boolean;
  has_game_access: boolean;
  user: {
    id: number;
    username: string;
    is_admin: boolean;
  } | null;
  permissions: string[];
  app_roles: Array<{ app_id: string; role: 'user' | 'admin' }>;
  auth_service_error?: boolean;
  auth_rate_limited?: boolean;
  auth_retry_after_sec?: number;
};

type AuthStateCache = Partial<Record<string, Promise<RemoteAuthState>>>;

function parseAppRolesFromAuthBody(
  appRolesRaw: unknown,
): Array<{ app_id: string; role: 'user' | 'admin' }> {
  if (!Array.isArray(appRolesRaw)) {
    return [];
  }
  const out: Array<{ app_id: string; role: 'user' | 'admin' }> = [];
  for (const entry of appRolesRaw) {
    if (entry === null || typeof entry !== 'object') continue;
    const raw = entry as { app_id?: unknown; role?: unknown };
    if (typeof raw.app_id !== 'string' || typeof raw.role !== 'string') continue;
    const app_id = raw.app_id.trim().toLowerCase();
    if (app_id === '') continue;
    const roleNorm = raw.role.trim().toLowerCase();
    let role: 'user' | 'admin';
    if (roleNorm === 'admin') {
      role = 'admin';
    } else if (roleNorm === 'user') {
      role = 'user';
    } else {
      log('warn', 'Unknown app_roles.role; treating as user', {
        offending_entry: entry,
        app_id,
        role: raw.role,
      });
      role = 'user';
    }
    out.push({ app_id, role });
  }
  return out;
}

function cacheKeyForGame(gameId?: string): string {
  return gameId ?? '__global__';
}

function getRequestAuthCache(req: Request): AuthStateCache {
  const reqWithCache = req as Request & {
    [AUTH_STATE_CACHE_KEY]?: AuthStateCache;
  };
  if (!reqWithCache[AUTH_STATE_CACHE_KEY]) {
    reqWithCache[AUTH_STATE_CACHE_KEY] = {};
  }
  return reqWithCache[AUTH_STATE_CACHE_KEY];
}

async function fetchRemoteAuthState(req: Request, gameId?: string): Promise<RemoteAuthState> {
  const cache = getRequestAuthCache(req);
  const cacheKey = cacheKeyForGame(gameId);
  if (cache[cacheKey]) return await cache[cacheKey];

  cache[cacheKey] = (async () => {
    const meUrl = new URL(`${AUTH_SERVICE_URL}/api/auth/me`);
    if (gameId) meUrl.searchParams.set('app', gameId);
    const upstreamSignal = createAuthUpstreamSignal(req);
    try {
      const upstream = await fetch(meUrl, {
        method: 'GET',
        headers: {
          cookie: req.headers.cookie ?? '',
          accept: 'application/json',
        },
        signal: upstreamSignal.signal,
      });
      if (!upstream.ok) {
        if (upstream.status === 429) {
          const retryAfterSec = parseRetryAfterSeconds(upstream.headers.get('retry-after'));
          return {
            authenticated: false,
            has_game_access: false,
            user: null,
            permissions: [],
            app_roles: [],
            auth_service_error: true,
            auth_rate_limited: true,
            auth_retry_after_sec: retryAfterSec,
          };
        }
        if (upstream.status >= 500) {
          return {
            authenticated: false,
            has_game_access: false,
            user: null,
            permissions: [],
            app_roles: [],
            auth_service_error: true,
          };
        }
        return {
          authenticated: false,
          has_game_access: false,
          user: null,
          permissions: [],
          app_roles: [],
        };
      }
      const body = (await upstream.json()) as Record<string, unknown>;
      const user = body.user;
      const app_roles = parseAppRolesFromAuthBody(body.app_roles);
      return {
        authenticated: body.authenticated === true,
        has_game_access: body.has_game_access === true,
        user:
          user &&
          typeof user === 'object' &&
          typeof (user as { id?: unknown }).id === 'number' &&
          typeof (user as { username?: unknown }).username === 'string' &&
          typeof (user as { is_admin?: unknown }).is_admin === 'boolean'
            ? {
                id: (user as { id: number }).id,
                username: (user as { username: string }).username,
                is_admin: (user as { is_admin: boolean }).is_admin,
              }
            : null,
        permissions: Array.isArray(body.permissions)
          ? body.permissions.filter((p): p is string => typeof p === 'string')
          : [],
        app_roles,
      };
    } catch (err) {
      if (isFetchAborted(err)) {
        if (!isClientDisconnected(req)) {
          const reason = upstreamSignal.abortedByTimeout() ? 'timeout' : 'aborted';
          log('warn', 'Auth service fetch did not complete', {
            reason,
            gameId: gameId ?? null,
            timeoutMs: AUTH_FETCH_TIMEOUT_MS,
          });
        }
      } else {
        log('error', 'Failed to fetch remote auth state', {
          err: err instanceof Error ? err.message : String(err),
          gameId: gameId ?? null,
        });
      }
      return {
        authenticated: false,
        has_game_access: false,
        user: null,
        permissions: [],
        app_roles: [],
        auth_service_error: true,
      };
    } finally {
      upstreamSignal.cleanup();
    }
  })();

  return await cache[cacheKey];
}

export async function syncSessionFromAuth(req: Request, gameId?: string): Promise<RemoteAuthState> {
  const state = await fetchRemoteAuthState(req, gameId);
  const session = getSession(req);
  if (!session) {
    return state;
  }
  if (state.auth_service_error) {
    return state;
  }
  if (!state.authenticated || !state.user) {
    delete session.user_id;
    delete session.username;
    delete session.is_admin;
    delete session.login_time;
    return state;
  }
  session.user_id = state.user.id;
  session.username = state.user.username;
  session.is_admin = state.user.is_admin;
  if (
    typeof session.login_time !== 'number' ||
    Date.now() - session.login_time > SESSION_TOUCH_INTERVAL_MS
  ) {
    session.login_time = Date.now();
  }
  return state;
}

export function effectiveAppAdmin(state: RemoteAuthState, appId: string = CODEX_APP_ID): boolean {
  if (!state.authenticated || !state.user) return false;
  if (state.user.is_admin) return true;
  const normalizedAppId = appId.trim().toLowerCase();
  const forApp = (state.app_roles ?? []).find((role) => role.app_id === normalizedAppId);
  return forApp?.role === 'admin';
}

export function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  return (async () => {
    try {
      const state = await syncSessionFromAuth(req);
      if (state.auth_service_error) {
        applyAuthServiceRetryHeaders(res, state);
        if (wantsJson(req)) {
          res.status(authServiceFailureStatus(state)).json({ error: 'Auth service unavailable' });
        } else {
          res.status(authServiceFailureStatus(state)).send('Authentication service unavailable');
        }
        return;
      }
      if (state.authenticated) {
        next();
        return;
      }
      res.redirect(getLoginRedirectUrl(req));
      return;
    } catch (err) {
      next(err);
      return;
    }
  })();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  return (async () => {
    const state = await syncSessionFromAuth(req);
    if (state.auth_service_error) {
      applyAuthServiceRetryHeaders(res, state);
      if (wantsJson(req)) {
        res.status(authServiceFailureStatus(state)).json({ error: 'Auth service unavailable' });
      } else {
        res.status(authServiceFailureStatus(state)).send('Authentication service unavailable');
      }
      return;
    }
    if (!state.authenticated || !state.user) {
      res.redirect(getLoginRedirectUrl(req));
      return;
    }
    if (!effectiveAppAdmin(state)) {
      if (wantsJson(req)) {
        res.status(403).json({ error: 'Game admin access required' });
      } else {
        res.status(403).send('Game admin access required');
      }
      return;
    }
    const session = getSession(req);
    if (!session || typeof session.user_id !== 'number' || session.user_id <= 0) {
      if (wantsJson(req)) {
        res.status(500).json({ error: 'Authenticated user id missing from session' });
      } else {
        res.status(500).send('Authenticated user id missing from session');
      }
      return;
    }
    next();
  })();
}

export function requireGameAccess(gameId: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const state = await syncSessionFromAuth(req, gameId);
    if (state.auth_service_error) {
      applyAuthServiceRetryHeaders(res, state);
      if (wantsJson(req)) {
        res.status(authServiceFailureStatus(state)).json({ error: 'Auth service unavailable' });
      } else {
        res.status(authServiceFailureStatus(state)).send('Authentication service unavailable');
      }
      return;
    }
    if (!state.authenticated || !state.user) {
      if (wantsJson(req)) {
        res.status(401).json({ error: 'Unauthorized' });
      } else {
        res.redirect(getLoginRedirectUrl(req, gameId));
      }
      return;
    }
    if (!state.has_game_access) {
      if (wantsJson(req)) {
        res.status(403).json({ error: 'Access to this game is not granted.' });
      } else {
        res.status(403).send('Access to this game is not granted.');
      }
      return;
    }
    next();
  };
}

export function requireAuthApi(req: Request, res: Response, next: NextFunction): Promise<void> {
  return (async () => {
    const state = await syncSessionFromAuth(req);
    if (state.auth_service_error) {
      applyAuthServiceRetryHeaders(res, state);
      res.status(authServiceFailureStatus(state)).json({ error: 'Auth service unavailable' });
      return;
    }
    if (state.authenticated) {
      next();
      return;
    }
    res.status(401).json({ error: 'Unauthorized' });
  })();
}

export function redirectIfAuthenticated(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  return (async () => {
    const state = await syncSessionFromAuth(req);
    if (state.authenticated) {
      res.redirect('/');
      return;
    }
    next();
  })();
}
