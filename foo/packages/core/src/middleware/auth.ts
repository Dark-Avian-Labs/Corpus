import type { Request, Response, NextFunction } from 'express';

import { type AuthSession } from '../auth.js';
import { AUTH_SERVICE_URL } from '../config.js';

function getSession(req: Request): AuthSession {
  return req.session as AuthSession;
}

function wantsJson(req: Request): boolean {
  return req.accepts('json') !== false;
}

const AUTH_FETCH_TIMEOUT_MS = Number.parseInt(
  process.env.AUTH_FETCH_TIMEOUT_MS ?? '5000',
  10,
);
const SESSION_TOUCH_INTERVAL_MS = 5 * 60 * 1000;
const AUTH_STATE_CACHE_KEY = Symbol('authStateCache');

export function getAppPublicBaseUrl(): string {
  const configured = process.env.APP_PUBLIC_BASE_URL?.trim();
  if (!configured) {
    throw new Error('APP_PUBLIC_BASE_URL must be set.');
  }
  const normalized = configured.replace(/\/+$/, '');
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error('APP_PUBLIC_BASE_URL must be a valid URL.');
  }
  const isLocalHttp =
    parsed.protocol === 'http:' &&
    (parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname === '::1');
  const nodeEnv = process.env.NODE_ENV;
  const isKnownNonProductionEnv =
    nodeEnv === 'development' || nodeEnv === 'test';
  if (
    nodeEnv == null ||
    (nodeEnv !== 'production' && !isKnownNonProductionEnv)
  ) {
    console.warn(
      `Unknown or unset NODE_ENV "${nodeEnv ?? ''}" detected; defaulting APP_PUBLIC_BASE_URL protocol policy to production (https-only unless local http).`,
    );
  }
  if (
    parsed.protocol !== 'https:' &&
    !(isLocalHttp || isKnownNonProductionEnv)
  ) {
    throw new Error('APP_PUBLIC_BASE_URL must use https://');
  }
  return normalized;
}

function getLoginRedirectUrl(req: Request, gameId?: string): string {
  const nextPath = gameId ? `/games/${gameId}` : req.originalUrl || '/';
  const next = new URL(nextPath, getAppPublicBaseUrl()).toString();
  const authUrl = new URL(`${AUTH_SERVICE_URL}/login`);
  authUrl.searchParams.set('next', next);
  return authUrl.toString();
}

type RemoteAuthState = {
  authenticated: boolean;
  has_game_access: boolean;
  user: {
    id: number;
    username: string;
    is_admin: boolean;
    avatar: number;
  } | null;
  permissions: string[];
};

type AuthStateCache = Partial<Record<string, Promise<RemoteAuthState>>>;

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

async function fetchRemoteAuthState(
  req: Request,
  gameId?: string,
): Promise<RemoteAuthState> {
  const cache = getRequestAuthCache(req);
  const cacheKey = cacheKeyForGame(gameId);
  if (cache[cacheKey]) return await cache[cacheKey];

  cache[cacheKey] = (async () => {
    const meUrl = new URL(`${AUTH_SERVICE_URL}/api/auth/me`);
    if (gameId) meUrl.searchParams.set('app', gameId);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), AUTH_FETCH_TIMEOUT_MS);
    try {
      const upstream = await fetch(meUrl, {
        method: 'GET',
        headers: {
          cookie: req.headers.cookie ?? '',
          accept: 'application/json',
        },
        signal: controller.signal,
      });
      if (!upstream.ok) {
        return {
          authenticated: false,
          has_game_access: false,
          user: null,
          permissions: [],
        };
      }
      const body = (await upstream.json()) as Partial<RemoteAuthState>;
      const user = body.user;
      return {
        authenticated: body.authenticated === true,
        has_game_access: body.has_game_access === true,
        user:
          user &&
          typeof user.id === 'number' &&
          typeof user.username === 'string' &&
          typeof user.is_admin === 'boolean' &&
          Number.isInteger((user as { avatar?: unknown }).avatar) &&
          (user as { avatar: number }).avatar >= 1 &&
          (user as { avatar: number }).avatar <= 16
            ? user
            : null,
        permissions: Array.isArray(body.permissions)
          ? body.permissions.filter((p): p is string => typeof p === 'string')
          : [],
      };
    } catch {
      return {
        authenticated: false,
        has_game_access: false,
        user: null,
        permissions: [],
      };
    } finally {
      clearTimeout(timeout);
    }
  })();

  return await cache[cacheKey];
}

async function syncSessionFromAuth(
  req: Request,
  gameId?: string,
): Promise<RemoteAuthState> {
  const state = await fetchRemoteAuthState(req, gameId);
  const session = getSession(req);
  if (!session) {
    return state;
  }
  if (!state.authenticated || !state.user) {
    delete session.user_id;
    delete session.username;
    delete session.is_admin;
    delete session.avatar;
    delete session.login_time;
    return state;
  }
  session.user_id = state.user.id;
  session.username = state.user.username;
  session.is_admin = state.user.is_admin;
  session.avatar = state.user.avatar;
  if (
    typeof session.login_time !== 'number' ||
    Date.now() - session.login_time > SESSION_TOUCH_INTERVAL_MS
  ) {
    session.login_time = Date.now();
  }
  return state;
}

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  return (async () => {
    const state = await syncSessionFromAuth(req);
    if (state.authenticated) {
      next();
      return;
    }
    res.redirect(getLoginRedirectUrl(req));
  })();
}

export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  return (async () => {
    const state = await syncSessionFromAuth(req);
    if (!state.authenticated || !state.user) {
      res.redirect(getLoginRedirectUrl(req));
      return;
    }
    if (!state.user.is_admin) {
      if (wantsJson(req)) {
        res.status(403).json({ error: 'Admin access required' });
      } else {
        res.status(403).send('Admin access required');
      }
      return;
    }
    const session = getSession(req);
    if (
      !session ||
      typeof session.user_id !== 'number' ||
      session.user_id <= 0
    ) {
      if (wantsJson(req)) {
        res
          .status(500)
          .json({ error: 'Authenticated user id missing from session' });
      } else {
        res.status(500).send('Authenticated user id missing from session');
      }
      return;
    }
    next();
  })();
}

export function requireGameAccess(gameId: string) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const state = await syncSessionFromAuth(req, gameId);
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

export function requireAuthApi(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  return (async () => {
    const state = await syncSessionFromAuth(req);
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
