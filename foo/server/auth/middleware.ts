import {
  requireAuth as coreRequireAuth,
  requireAuthApi as coreRequireAuthApi,
  requireAdmin as coreRequireAdmin,
} from '@corpus/core';
import type { NextFunction, Request, Response } from 'express';

import { buildAuthLoginUrl } from './remoteAuth.js';

export const requireAuth = coreRequireAuth;
export const requireAuthApi = coreRequireAuthApi;
export const requireAdmin = coreRequireAdmin;

export function ensureAuthenticatedPage(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (
    req.session &&
    typeof req.session.user_id === 'number' &&
    req.session.user_id > 0
  ) {
    next();
    return;
  }
  res.redirect(buildAuthLoginUrl(req));
}
