import { requireAuth, requireAdmin, requireGameAccess } from '@corpus/core';
import type { Application, Request, Response } from 'express';
import fs from 'fs';

import { WARFRAME_DB_PATH } from '../config.js';

const GAME_ID = 'warframe';

const SAFE_NAMED_COLORS = new Set([
  'red',
  'blue',
  'green',
  'white',
  'black',
  'orange',
  'yellow',
  'purple',
  'pink',
  'cyan',
  'gray',
  'grey',
  'navy',
  'teal',
  'maroon',
  'olive',
  'lime',
  'aqua',
  'fuchsia',
  'silver',
]);

function validateAccentColor(value: string | undefined): string {
  if (!value) return '';
  const trimmed = value.trim();
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(trimmed)) return trimmed;
  if (/^rgba?\(\s*[\d.]+(%?\s*,\s*[\d.]+%?){2,3}\s*\)$/.test(trimmed))
    return trimmed;
  if (
    /^hsla?\(\s*[\d.]+\s*,\s*[\d.]+%\s*,\s*[\d.]+%\s*(,\s*[\d.]+)?\s*\)$/.test(
      trimmed,
    )
  )
    return trimmed;
  if (SAFE_NAMED_COLORS.has(trimmed.toLowerCase())) return trimmed;
  return '';
}

type PageRouteOptions = {
  viewPrefix: string;
  appName: string;
  getCsrfToken?: (req: Request, res: Response) => string;
  accentColor?: string;
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
  const accentColor = validateAccentColor(options.accentColor);
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
      accentColor,
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
        accentColor,
      });
    },
  );
}

export function dbExists(): boolean {
  return fs.existsSync(WARFRAME_DB_PATH);
}
