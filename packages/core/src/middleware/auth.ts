import type { Request, Response, NextFunction } from 'express';

import { type AuthSession } from '../auth.js';
import { AUTH_SERVICE_URL } from '../config.js';

function getSession(req: Request): AuthSession {
  return req.session as AuthSession;
}

function wantsJson(req: Request): boolean {
  return req.accepts('json') !== false;
}

function getProto(req: Request): string {
  const forwardedProto = req.headers['x-forwarded-proto'];
  if (Array.isArray(forwardedProto)) return forwardedProto[0] || req.protocol;
  if (typeof forwardedProto === 'string' && forwardedProto.length > 0) {
    return forwardedProto.split(',')[0]?.trim() || req.protocol;
  }
  return req.protocol;
}

function getHost(req: Request): string {
  const forwardedHost = req.headers['x-forwarded-host'];
  if (Array.isArray(forwardedHost)) return forwardedHost[0] || req.get('host') || '';
  if (typeof forwardedHost === 'string' && forwardedHost.length > 0) {
    return forwardedHost.split(',')[0]?.trim() || req.get('host') || '';
  }
  return req.get('host') || '';
}

function getLoginRedirectUrl(req: Request, gameId?: string): string {
  const proto = getProto(req);
  const host = getHost(req);
  const nextPath = gameId ? `/games/${gameId}` : req.originalUrl || '/';
  const next = `${proto}://${host}${nextPath}`;
  const authUrl = new URL(`${AUTH_SERVICE_URL}/login`);
  authUrl.searchParams.set('next', next);
  return authUrl.toString();
}

type RemoteAuthState = {
  authenticated: boolean;
  has_game_access: boolean;
  user: { id: number; username: string; is_admin: boolean } | null;
  permissions: string[];
};

async function fetchRemoteAuthState(
  req: Request,
  gameId?: string,
): Promise<RemoteAuthState> {
  const meUrl = new URL(`${AUTH_SERVICE_URL}/api/auth/me`);
  if (gameId) meUrl.searchParams.set('app', gameId);
  try {
    const upstream = await fetch(meUrl, {
      method: 'GET',
      headers: {
        cookie: req.headers.cookie ?? '',
        accept: 'application/json',
      },
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
        typeof user.is_admin === 'boolean'
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
  }
}

async function syncSessionFromAuth(req: Request, gameId?: string): Promise<RemoteAuthState> {
  const state = await fetchRemoteAuthState(req, gameId);
  const session = getSession(req);
  if (!session) {
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
  session.login_time = Date.now();
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
    next();
  })();
}

export function requireGameAccess(gameId: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const state = await syncSessionFromAuth(req, gameId);
    if (!state.authenticated || !state.user) {
      res.redirect(getLoginRedirectUrl(req, gameId));
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
