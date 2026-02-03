import type { Request, Response, NextFunction } from 'express';

import {
  type AuthSession,
  isAuthenticated,
  isAdmin,
  hasAccess,
} from '../auth.js';

function getSession(req: Request): AuthSession {
  return req.session as AuthSession;
}

function wantsJson(req: Request): boolean {
  return req.accepts('json') !== false;
}

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (isAuthenticated(getSession(req))) {
    next();
    return;
  }
  res.redirect('/login');
}

export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const session = getSession(req);
  if (!isAuthenticated(session)) {
    res.redirect('/login');
    return;
  }
  if (!isAdmin(session)) {
    if (wantsJson(req)) {
      res.status(403).json({ error: 'Admin access required' });
    } else {
      res.status(403).send('Admin access required');
    }
    return;
  }
  next();
}

export function requireGameAccess(gameId: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const session = getSession(req);
    if (!isAuthenticated(session)) {
      res.redirect('/login');
      return;
    }
    const userId = session?.user_id;
    if (typeof userId !== 'number') {
      res.redirect('/login');
      return;
    }
    if (!hasAccess(userId, gameId)) {
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
): void {
  if (isAuthenticated(getSession(req))) {
    next();
    return;
  }
  res.status(401).json({ error: 'Unauthorized' });
}

export function redirectIfAuthenticated(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (isAuthenticated(getSession(req))) {
    res.redirect('/');
    return;
  }
  next();
}
