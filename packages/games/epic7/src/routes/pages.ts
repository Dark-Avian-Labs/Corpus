import { requireAuth, requireAdmin, requireGameAccess } from '@corpus/core';
import type { Application, Request, Response } from 'express';

import {
  HERO_CLASSES,
  ARTIFACT_CLASSES,
  ELEMENTS,
  HERO_RATINGS,
  RATING_COLORS,
  GAUGE_COLORS,
  CLASS_DISPLAY_NAMES,
  ELEMENT_DISPLAY_NAMES,
  ARTIFACT_GAUGE_MAX,
  ARTIFACT_GAUGE_FILLED,
  ARTIFACT_GAUGE_EMPTY,
} from '../config.js';

const GAME_ID = 'epic7';

const PAGE_TITLE = 'Corpus - Epic Seven';

export function registerPageRoutes(
  app: Application,
  basePath: string,
  options: {
    viewPrefix: string;
    appName: string;
    getCsrfToken?: (req: Request, res: Response) => string;
  },
): void {
  const appName = options.appName;
  const viewPrefix = options.viewPrefix;
  const art = (res: Response) => (res.locals as { art?: string }).art ?? '';
  const csrfToken = (req: Request, res: Response) =>
    options.getCsrfToken?.(req, res) ??
    (res.locals as { csrfToken?: string }).csrfToken ??
    '';

  const chain = [requireGameAccess(GAME_ID), requireAuth];

  app.get(basePath, ...chain, (req: Request, res: Response) => {
    res.render(`${viewPrefix}/index`, {
      appName,
      pageTitle: PAGE_TITLE,
      basePath,
      art: art(res),
      isAdmin: Boolean((req.session as { is_admin?: boolean })?.is_admin),
      heroClasses: HERO_CLASSES,
      artifactClasses: ARTIFACT_CLASSES,
      elements: ELEMENTS,
      heroRatings: HERO_RATINGS,
      ratingColors: RATING_COLORS,
      gaugeColors: GAUGE_COLORS,
      classNames: CLASS_DISPLAY_NAMES,
      elementNames: ELEMENT_DISPLAY_NAMES,
      gaugeMax: ARTIFACT_GAUGE_MAX,
      gaugeFilled: ARTIFACT_GAUGE_FILLED,
      gaugeEmpty: ARTIFACT_GAUGE_EMPTY,
      csrfToken: csrfToken(req, res),
    });
  });

  const adminChain = [requireGameAccess(GAME_ID), requireAuth, requireAdmin];
  app.get(
    basePath + (basePath.endsWith('/') ? 'admin' : '/admin'),
    ...adminChain,
    (req: Request, res: Response) => {
      res.render(`${viewPrefix}/admin`, {
        appName,
        pageTitle: PAGE_TITLE,
        basePath,
        art: art(res),
        heroClasses: HERO_CLASSES,
        artifactClasses: ARTIFACT_CLASSES,
        elements: ELEMENTS,
        classNames: CLASS_DISPLAY_NAMES,
        elementNames: ELEMENT_DISPLAY_NAMES,
        csrfToken: csrfToken(req, res),
      });
    },
  );
}
