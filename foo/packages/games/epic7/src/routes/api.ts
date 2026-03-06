import { validateBody } from '@corpus/core/validation';
import type { Request, Response } from 'express';
import fs from 'fs';

import {
  ARTIFACT_CLASSES,
  ARTIFACT_GAUGE_MAX,
  ELEMENTS,
  EPIC7_DB_PATH,
  HERO_CLASSES,
} from '../config.js';
import {
  addAccountSchema,
  addArtifactSchema,
  addHeroSchema,
  adminAddBaseArtifactSchema,
  adminAddBaseHeroSchema,
  adminDeleteBaseArtifactSchema,
  adminDeleteBaseHeroSchema,
  deleteAccountSchema,
  deleteArtifactSchema,
  deleteHeroSchema,
  switchAccountSchema,
  updateArtifactDetailsSchema,
  updateArtifactSchema,
  updateHeroDetailsSchema,
  updateHeroSchema,
} from './validation.js';
import * as q from '../db/queries.js';
import { getDb } from '../db/schema.js';

function session(req: Request): {
  user_id?: number;
  account_id?: number | null;
  account_name?: string | null;
  is_admin?: boolean;
} {
  return req.session as unknown as {
    user_id?: number;
    account_id?: number | null;
    account_name?: string | null;
    is_admin?: boolean;
  };
}

function json(res: Response, data: object, status = 200): void {
  res.status(status).json(data);
}

function err(res: Response, message: string, status = 400): void {
  res.status(status).json({ error: message });
}

function getDbOrFail(res: Response): ReturnType<typeof getDb> | null {
  if (!fs.existsSync(EPIC7_DB_PATH)) {
    err(res, 'Database not found. Please initialize the database.', 500);
    return null;
  }
  try {
    return getDb();
  } catch {
    err(res, 'Database connection failed.', 500);
    return null;
  }
}

export function handleWorksheets(_req: Request, res: Response): void {
  json(res, {
    worksheets: [
      { id: 'heroes', name: 'Heroes' },
      { id: 'artifacts', name: 'Artifacts' },
    ],
  });
}

export function handleHeroes(req: Request, res: Response): void {
  const accountId = session(req).account_id;
  if (!accountId) {
    err(res, 'No game account selected. Please create one first.', 400);
    return;
  }
  const db = getDbOrFail(res);
  if (!db) return;
  const classFilter = String(req.query.class ?? '').trim();
  const elementFilter = String(req.query.element ?? '').trim();
  const heroes = q.getHeroes(db, accountId, classFilter, elementFilter);
  const stats = q.getHeroStats(db, accountId);
  const baseHeroes = q.getBaseHeroes(db);
  json(res, {
    heroes,
    stats,
    filters: { classes: [...HERO_CLASSES], elements: [...ELEMENTS] },
    base_heroes: baseHeroes,
  });
}

export function handleArtifacts(req: Request, res: Response): void {
  const accountId = session(req).account_id;
  if (!accountId) {
    err(res, 'No game account selected. Please create one first.', 400);
    return;
  }
  const db = getDbOrFail(res);
  if (!db) return;
  const classFilter = String(req.query.class ?? '').trim();
  const artifacts = q.getArtifacts(db, accountId, classFilter);
  const stats = q.getArtifactStats(db, accountId);
  const baseArtifacts = q.getBaseArtifacts(db);
  json(res, {
    artifacts,
    stats,
    filters: { classes: [...ARTIFACT_CLASSES] },
    gauge_max: ARTIFACT_GAUGE_MAX,
    base_artifacts: baseArtifacts,
  });
}

export function handleUpdateHero(req: Request, res: Response): void {
  if (req.method !== 'POST') {
    err(res, 'POST method required.', 405);
    return;
  }
  const accountId = session(req).account_id;
  if (!accountId) {
    err(res, 'No game account selected.', 400);
    return;
  }
  const data = validateBody(updateHeroSchema, req.body, res);
  if (!data) return;
  const db = getDbOrFail(res);
  if (!db) return;
  if (!q.updateHeroRating(db, data.hero_id, accountId, data.rating)) {
    err(res, 'Hero not found.', 404);
    return;
  }
  json(res, { success: true, rating: data.rating });
}

export function handleUpdateArtifact(req: Request, res: Response): void {
  if (req.method !== 'POST') {
    err(res, 'POST method required.', 405);
    return;
  }
  const accountId = session(req).account_id;
  if (!accountId) {
    err(res, 'No game account selected.', 400);
    return;
  }
  const data = validateBody(updateArtifactSchema, req.body, res);
  if (!data) return;
  const db = getDbOrFail(res);
  if (!db) return;
  if (
    !q.updateArtifactGauge(db, data.artifact_id, accountId, data.gauge_level)
  ) {
    err(res, 'Artifact not found.', 404);
    return;
  }
  json(res, { success: true, gauge_level: data.gauge_level });
}

export function handleAddHero(req: Request, res: Response): void {
  if (req.method !== 'POST') {
    err(res, 'POST method required.', 405);
    return;
  }
  const accountId = session(req).account_id;
  if (!accountId) {
    err(res, 'No game account selected.', 400);
    return;
  }
  const data = validateBody(addHeroSchema, req.body, res);
  if (!data) return;
  const db = getDbOrFail(res);
  if (!db) return;
  const heroId = q.addHero(
    db,
    accountId,
    data.name,
    data.class,
    data.element,
    data.star_rating,
    data.base_hero_id ?? null,
  );
  json(res, { success: true, hero_id: heroId });
}

export function handleAddArtifact(req: Request, res: Response): void {
  if (req.method !== 'POST') {
    err(res, 'POST method required.', 405);
    return;
  }
  const accountId = session(req).account_id;
  if (!accountId) {
    err(res, 'No game account selected.', 400);
    return;
  }
  const data = validateBody(addArtifactSchema, req.body, res);
  if (!data) return;
  const db = getDbOrFail(res);
  if (!db) return;
  const artifactId = q.addArtifact(
    db,
    accountId,
    data.name,
    data.class,
    data.star_rating,
    data.base_artifact_id ?? null,
  );
  json(res, { success: true, artifact_id: artifactId });
}

export function handleDeleteHero(req: Request, res: Response): void {
  if (req.method !== 'POST') {
    err(res, 'POST method required.', 405);
    return;
  }
  const accountId = session(req).account_id;
  if (!accountId) {
    err(res, 'No game account selected.', 400);
    return;
  }
  const data = validateBody(deleteHeroSchema, req.body, res);
  if (!data) return;
  const db = getDbOrFail(res);
  if (!db) return;
  if (!q.deleteHero(db, data.hero_id, accountId)) {
    err(res, 'Hero not found.', 404);
    return;
  }
  json(res, { success: true });
}

export function handleDeleteArtifact(req: Request, res: Response): void {
  if (req.method !== 'POST') {
    err(res, 'POST method required.', 405);
    return;
  }
  const accountId = session(req).account_id;
  if (!accountId) {
    err(res, 'No game account selected.', 400);
    return;
  }
  const data = validateBody(deleteArtifactSchema, req.body, res);
  if (!data) return;
  const db = getDbOrFail(res);
  if (!db) return;
  if (!q.deleteArtifact(db, data.artifact_id, accountId)) {
    err(res, 'Artifact not found.', 404);
    return;
  }
  json(res, { success: true });
}

export function handleUpdateHeroDetails(req: Request, res: Response): void {
  if (req.method !== 'POST') {
    err(res, 'POST method required.', 405);
    return;
  }
  const accountId = session(req).account_id;
  if (!accountId) {
    err(res, 'No game account selected.', 400);
    return;
  }
  const data = validateBody(updateHeroDetailsSchema, req.body, res);
  if (!data) return;
  const db = getDbOrFail(res);
  if (!db) return;
  if (
    !q.updateHeroDetails(
      db,
      data.hero_id,
      accountId,
      data.name,
      data.class,
      data.element,
      data.star_rating,
    )
  ) {
    err(res, 'Hero not found.', 404);
    return;
  }
  json(res, { success: true });
}

export function handleUpdateArtifactDetails(req: Request, res: Response): void {
  if (req.method !== 'POST') {
    err(res, 'POST method required.', 405);
    return;
  }
  const accountId = session(req).account_id;
  if (!accountId) {
    err(res, 'No game account selected.', 400);
    return;
  }
  const data = validateBody(updateArtifactDetailsSchema, req.body, res);
  if (!data) return;
  const db = getDbOrFail(res);
  if (!db) return;
  if (
    !q.updateArtifactDetails(
      db,
      data.artifact_id,
      accountId,
      data.name,
      data.class,
      data.star_rating,
    )
  ) {
    err(res, 'Artifact not found.', 404);
    return;
  }
  json(res, { success: true });
}

export function handleAccounts(req: Request, res: Response): void {
  const userId = session(req).user_id;
  if (!userId) {
    err(res, 'Unauthorized', 401);
    return;
  }
  const db = getDbOrFail(res);
  if (!db) return;
  const accounts = q.getUserAccountsForApi(db, userId);
  let currentId = session(req).account_id ?? null;
  if (currentId == null && accounts.length > 0) {
    const firstActive = accounts.find((a) => a.is_active === 1);
    const first = firstActive ?? accounts[0];
    currentId = first.id;
    const s = req.session as unknown as {
      account_id?: number;
      account_name?: string;
    };
    s.account_id = first.id;
    s.account_name = first.account_name;
  }
  json(res, {
    accounts: accounts.map((a) => ({
      id: a.id,
      account_name: a.account_name,
      is_active: a.is_active,
      created_at: a.created_at,
    })),
    current_account_id: currentId,
  });
}

export function handleSwitchAccount(req: Request, res: Response): void {
  if (req.method !== 'POST') {
    err(res, 'POST method required.', 405);
    return;
  }
  const userId = session(req).user_id;
  if (!userId) {
    err(res, 'Unauthorized', 401);
    return;
  }
  const data = validateBody(switchAccountSchema, req.body, res);
  if (!data) return;
  const accountId = data.account_id;
  const db = getDbOrFail(res);
  if (!db) return;
  const account = q.getGameAccountByIdAndUser(db, accountId, userId);
  if (!account) {
    err(res, 'Account not found.');
    return;
  }
  q.setActiveAccount(db, userId, accountId);
  const s = req.session as unknown as {
    account_id?: number;
    account_name?: string;
  };
  s.account_id = account.id;
  s.account_name = account.account_name;
  json(res, {
    success: true,
    account: { id: account.id, account_name: account.account_name },
  });
}

export function handleAddAccount(req: Request, res: Response): void {
  if (req.method !== 'POST') {
    err(res, 'POST method required.', 405);
    return;
  }
  const userId = session(req).user_id;
  if (!userId) {
    err(res, 'Unauthorized', 401);
    return;
  }
  const data = validateBody(addAccountSchema, req.body, res);
  if (!data) return;
  const name = data.account_name;
  const db = getDbOrFail(res);
  if (!db) return;
  const existing = q.getAccountByNameAndUser(db, userId, name);
  if (existing) {
    err(res, 'An account with this name already exists.');
    return;
  }
  const accountsBefore = q.getGameAccountsByUserId(db, userId);
  const isFirst = accountsBefore.length === 0;
  const accountId = q.createGameAccount(db, userId, name, isFirst);
  if (isFirst) {
    const s = req.session as unknown as {
      account_id?: number;
      account_name?: string;
    };
    s.account_id = accountId;
    s.account_name = name;
    q.seedAccountHeroesFromBase(db, accountId);
    q.seedAccountArtifactsFromBase(db, accountId);
  }
  json(res, { success: true, account_id: accountId });
}

export function handleDeleteAccount(req: Request, res: Response): void {
  if (req.method !== 'POST') {
    err(res, 'POST method required.', 405);
    return;
  }
  const userId = session(req).user_id;
  if (!userId) {
    err(res, 'Unauthorized', 401);
    return;
  }
  const data = validateBody(deleteAccountSchema, req.body, res);
  if (!data) return;
  const accountId = data.account_id;
  const db = getDbOrFail(res);
  if (!db) return;
  if (!q.deleteGameAccount(db, accountId, userId)) {
    err(res, 'Account not found.');
    return;
  }
  const accounts = q.getGameAccountsByUserId(db, userId);
  const stillCurrent = session(req).account_id === accountId;
  const s = req.session as unknown as {
    account_id?: number | null;
    account_name?: string | null;
  };
  if (stillCurrent && accounts.length > 0) {
    s.account_id = accounts[0].id;
    s.account_name = accounts[0].account_name;
  } else if (stillCurrent) {
    s.account_id = null;
    s.account_name = null;
  }
  json(res, { success: true });
}

export function handleUserInfo(req: Request, res: Response): void {
  const s = session(req);
  json(res, {
    user_id: s.user_id ?? null,
    username:
      (req.session as unknown as { username?: string }).username ?? null,
    is_admin: !!s.is_admin,
    account_id: s.account_id ?? null,
    account_name: s.account_name ?? null,
  });
}

export function handleAdminBaseHeroes(req: Request, res: Response): void {
  if (!session(req).is_admin) {
    err(res, 'Admin access required.', 403);
    return;
  }
  const db = getDbOrFail(res);
  if (!db) return;
  const heroes = db
    .prepare(
      'SELECT id, name, class, element, star_rating, display_order FROM base_heroes ORDER BY display_order ASC',
    )
    .all() as q.BaseHero[];
  json(res, { heroes });
}

export function handleAdminBaseArtifacts(req: Request, res: Response): void {
  if (!session(req).is_admin) {
    err(res, 'Admin access required.', 403);
    return;
  }
  const db = getDbOrFail(res);
  if (!db) return;
  const artifacts = db
    .prepare(
      'SELECT id, name, class, star_rating, display_order FROM base_artifacts ORDER BY display_order ASC',
    )
    .all() as q.BaseArtifact[];
  json(res, { artifacts });
}

export function handleAdminAddBaseHero(req: Request, res: Response): void {
  if (req.method !== 'POST') {
    err(res, 'POST method required.', 405);
    return;
  }
  if (!session(req).is_admin) {
    err(res, 'Admin access required.', 403);
    return;
  }
  const data = validateBody(adminAddBaseHeroSchema, req.body, res);
  if (!data) return;
  const { name, class: cls, element, star_rating: starRating } = data;
  const db = getDbOrFail(res);
  if (!db) return;
  const heroId = q.addBaseHero(db, name, cls, element, starRating);
  if (!heroId) {
    err(res, 'Failed to create base hero.');
    return;
  }
  const row = db
    .prepare('SELECT display_order FROM base_heroes WHERE id = ?')
    .get(heroId) as { display_order: number } | undefined;
  if (row == null) {
    err(res, 'Failed to create base hero.');
    return;
  }
  q.addBaseHeroToAllAccounts(
    db,
    heroId,
    name,
    cls,
    element,
    starRating,
    row.display_order,
  );
  json(res, { success: true, hero_id: heroId });
}

export function handleAdminAddBaseArtifact(req: Request, res: Response): void {
  if (req.method !== 'POST') {
    err(res, 'POST method required.', 405);
    return;
  }
  if (!session(req).is_admin) {
    err(res, 'Admin access required.', 403);
    return;
  }
  const data = validateBody(adminAddBaseArtifactSchema, req.body, res);
  if (!data) return;
  const { name, class: cls, star_rating: starRating } = data;
  const db = getDbOrFail(res);
  if (!db) return;
  const artifactId = q.addBaseArtifact(db, name, cls, starRating);
  if (!artifactId) {
    err(res, 'Failed to create base artifact.');
    return;
  }
  const row = db
    .prepare('SELECT display_order FROM base_artifacts WHERE id = ?')
    .get(artifactId) as { display_order: number } | undefined;
  if (row == null) {
    err(res, 'Failed to create base artifact.');
    return;
  }
  q.addBaseArtifactToAllAccounts(
    db,
    artifactId,
    name,
    cls,
    starRating,
    row.display_order,
  );
  json(res, { success: true, artifact_id: artifactId });
}

export function handleAdminDeleteBaseHero(req: Request, res: Response): void {
  if (req.method !== 'POST') {
    err(res, 'POST method required.', 405);
    return;
  }
  if (!session(req).is_admin) {
    err(res, 'Admin access required.', 403);
    return;
  }
  const data = validateBody(adminDeleteBaseHeroSchema, req.body, res);
  if (!data) return;
  const db = getDbOrFail(res);
  if (!db) return;
  q.deleteBaseHero(db, data.hero_id);
  json(res, { success: true });
}

export function handleAdminDeleteBaseArtifact(
  req: Request,
  res: Response,
): void {
  if (req.method !== 'POST') {
    err(res, 'POST method required.', 405);
    return;
  }
  if (!session(req).is_admin) {
    err(res, 'Admin access required.', 403);
    return;
  }
  const data = validateBody(adminDeleteBaseArtifactSchema, req.body, res);
  if (!data) return;
  const db = getDbOrFail(res);
  if (!db) return;
  q.deleteBaseArtifact(db, data.artifact_id);
  json(res, { success: true });
}
