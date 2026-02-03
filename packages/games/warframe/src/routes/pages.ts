import { requireAuth, requireAdmin, requireGameAccess } from '@corpus/core';
import type { Application, Request, Response } from 'express';
import fs from 'fs';

import { WARFRAME_DB_PATH } from '../config.js';

const GAME_ID = 'warframe';

type PageRouteOptions = {
  viewPrefix: string;
  appName: string;
  getCsrfToken?: (req: Request, res: Response) => string;
  logger?: {
    warn?: (message: string) => void;
  };
};

export function registerPageRoutes(
  app: Application,
  basePath: string,
  options: PageRouteOptions,
): void {
  const appName = options.appName;
  const viewPrefix = options.viewPrefix;
  const art = (res: Response) => (res.locals as { art?: string }).art ?? '';
  const csrfToken = (req: Request, res: Response): string => {
    const fromGetter = options.getCsrfToken?.(req, res);
    const fromLocals = (res.locals as { csrfToken?: string }).csrfToken;
    const value = fromGetter ?? fromLocals ?? '';
    if (value === '' && fromGetter === undefined && fromLocals === undefined) {
      const msg =
        '[warframe pages] CSRF token missing: getCsrfToken and res.locals.csrfToken are both absent';
      if (options.logger?.warn) options.logger.warn(msg);
      else console.warn(msg);
    }
    return value;
  };

  const chain = [requireGameAccess(GAME_ID), requireAuth];

  app.get(basePath, ...chain, (req: Request, res: Response) => {
    res.render(`${viewPrefix}/index`, {
      appName,
      basePath,
      art: art(res),
      isAdmin: Boolean((req.session as { is_admin?: boolean })?.is_admin),
      csrfToken: csrfToken(req, res),
    });
  });

  app.get(
    basePath + (basePath.endsWith('/') ? 'admin' : '/admin'),
    requireGameAccess(GAME_ID),
    requireAuth,
    requireAdmin,
    (req: Request, res: Response) => {
      res.render(`${viewPrefix}/admin`, {
        appName,
        basePath,
        art: art(res),
        csrfToken: csrfToken(req, res),
      });
    },
  );
}

export function dbExists(): boolean {
  return fs.existsSync(WARFRAME_DB_PATH);
}
