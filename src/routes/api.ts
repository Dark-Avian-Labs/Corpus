import { Request, Response } from 'express';
import fs from 'fs';

import {
  isAdmin,
  getUserAccounts,
  switchAccount,
  createGameAccount,
  deleteGameAccount,
  createUser,
  deleteUser,
  changePassword,
  getAllUsers,
} from '../auth.js';
import {
  HERO_CLASSES,
  ARTIFACT_CLASSES,
  ELEMENTS,
  HERO_RATINGS,
  ARTIFACT_GAUGE_MAX,
  SQLITE_DB_PATH,
  DEBUG_MODE,
} from '../config.js';
import * as q from '../db/queries.js';
import { getDb } from '../db/schema.js';

function session(req: Request): {
  user_id?: number;
  account_id?: number | null;
  is_admin?: boolean;
} {
  return req.session as unknown as {
    user_id?: number;
    account_id?: number | null;
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
  if (!fs.existsSync(SQLITE_DB_PATH)) {
    err(res, 'Database not found. Please initialize the database.', 500);
    return null;
  }
  try {
    return getDb();
  } catch (e) {
    err(
      res,
      DEBUG_MODE && e instanceof Error
        ? e.message
        : 'Database connection failed.',
      500,
    );
    return null;
  }
}

function getBody(req: Request): Record<string, unknown> {
  return (req.body as Record<string, unknown>) ?? {};
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
  try {
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
  } finally {
    db.close();
  }
}

export function handleArtifacts(req: Request, res: Response): void {
  const accountId = session(req).account_id;
  if (!accountId) {
    err(res, 'No game account selected. Please create one first.', 400);
    return;
  }
  const db = getDbOrFail(res);
  if (!db) return;
  try {
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
  } finally {
    db.close();
  }
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
  const body = getBody(req);
  const heroId = parseInt(String(body.hero_id ?? 0), 10);
  const rating = String(body.rating ?? '').trim();
  if (heroId <= 0) {
    err(res, 'Invalid hero_id.');
    return;
  }
  if (!HERO_RATINGS.includes(rating as (typeof HERO_RATINGS)[number])) {
    err(res, 'Invalid rating value.');
    return;
  }
  const db = getDbOrFail(res);
  if (!db) return;
  try {
    if (!q.updateHeroRating(db, heroId, accountId, rating)) {
      err(res, 'Hero not found.', 404);
      return;
    }
    json(res, { success: true, rating });
  } finally {
    db.close();
  }
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
  const body = getBody(req);
  const artifactId = parseInt(String(body.artifact_id ?? 0), 10);
  const gaugeLevel = Math.max(
    0,
    Math.min(ARTIFACT_GAUGE_MAX, parseInt(String(body.gauge_level ?? 0), 10)),
  );
  if (artifactId <= 0) {
    err(res, 'Invalid artifact_id.');
    return;
  }
  const db = getDbOrFail(res);
  if (!db) return;
  try {
    if (!q.updateArtifactGauge(db, artifactId, accountId, gaugeLevel)) {
      err(res, 'Artifact not found.', 404);
      return;
    }
    json(res, { success: true, gauge_level: gaugeLevel });
  } finally {
    db.close();
  }
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
  const body = getBody(req);
  const name = String(body.name ?? '').trim();
  const cls = String(body.class ?? '')
    .toLowerCase()
    .trim();
  const element = String(body.element ?? '')
    .toLowerCase()
    .trim();
  const starRating = Math.max(
    3,
    Math.min(5, parseInt(String(body.star_rating ?? 5), 10)),
  );
  const baseHeroId =
    body.base_hero_id != null ? parseInt(String(body.base_hero_id), 10) : null;
  if (!name) {
    err(res, 'Name is required.');
    return;
  }
  if (!HERO_CLASSES.includes(cls as (typeof HERO_CLASSES)[number])) {
    err(res, 'Invalid class.');
    return;
  }
  if (!ELEMENTS.includes(element as (typeof ELEMENTS)[number])) {
    err(res, 'Invalid element.');
    return;
  }
  const db = getDbOrFail(res);
  if (!db) return;
  try {
    const heroId = q.addHero(
      db,
      accountId,
      name,
      cls,
      element,
      starRating,
      baseHeroId ?? null,
    );
    json(res, { success: true, hero_id: heroId });
  } finally {
    db.close();
  }
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
  const body = getBody(req);
  const name = String(body.name ?? '').trim();
  const cls = String(body.class ?? '')
    .toLowerCase()
    .trim();
  const starRating = Math.max(
    3,
    Math.min(5, parseInt(String(body.star_rating ?? 5), 10)),
  );
  const baseArtifactId =
    body.base_artifact_id != null
      ? parseInt(String(body.base_artifact_id), 10)
      : null;
  if (!name) {
    err(res, 'Name is required.');
    return;
  }
  if (!ARTIFACT_CLASSES.includes(cls as (typeof ARTIFACT_CLASSES)[number])) {
    err(res, 'Invalid class.');
    return;
  }
  const db = getDbOrFail(res);
  if (!db) return;
  try {
    const artifactId = q.addArtifact(
      db,
      accountId,
      name,
      cls,
      starRating,
      baseArtifactId ?? null,
    );
    json(res, { success: true, artifact_id: artifactId });
  } finally {
    db.close();
  }
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
  const body = getBody(req);
  const heroId = parseInt(String(body.hero_id ?? 0), 10);
  if (heroId <= 0) {
    err(res, 'Invalid hero_id.');
    return;
  }
  const db = getDbOrFail(res);
  if (!db) return;
  try {
    if (!q.deleteHero(db, heroId, accountId)) {
      err(res, 'Hero not found.', 404);
      return;
    }
    json(res, { success: true });
  } finally {
    db.close();
  }
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
  const body = getBody(req);
  const artifactId = parseInt(String(body.artifact_id ?? 0), 10);
  if (artifactId <= 0) {
    err(res, 'Invalid artifact_id.');
    return;
  }
  const db = getDbOrFail(res);
  if (!db) return;
  try {
    if (!q.deleteArtifact(db, artifactId, accountId)) {
      err(res, 'Artifact not found.', 404);
      return;
    }
    json(res, { success: true });
  } finally {
    db.close();
  }
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
  const body = getBody(req);
  const heroId = parseInt(String(body.hero_id ?? 0), 10);
  const name = String(body.name ?? '').trim();
  const cls = String(body.class ?? '')
    .toLowerCase()
    .trim();
  const element = String(body.element ?? '')
    .toLowerCase()
    .trim();
  const starRating = Math.max(
    3,
    Math.min(5, parseInt(String(body.star_rating ?? 5), 10)),
  );
  if (heroId <= 0) {
    err(res, 'Invalid hero_id.');
    return;
  }
  if (!name) {
    err(res, 'Name is required.');
    return;
  }
  if (!HERO_CLASSES.includes(cls as (typeof HERO_CLASSES)[number])) {
    err(res, 'Invalid class.');
    return;
  }
  if (!ELEMENTS.includes(element as (typeof ELEMENTS)[number])) {
    err(res, 'Invalid element.');
    return;
  }
  const db = getDbOrFail(res);
  if (!db) return;
  try {
    if (
      !q.updateHeroDetails(
        db,
        heroId,
        accountId,
        name,
        cls,
        element,
        starRating,
      )
    ) {
      err(res, 'Hero not found.', 404);
      return;
    }
    json(res, { success: true });
  } finally {
    db.close();
  }
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
  const body = getBody(req);
  const artifactId = parseInt(String(body.artifact_id ?? 0), 10);
  const name = String(body.name ?? '').trim();
  const cls = String(body.class ?? '')
    .toLowerCase()
    .trim();
  const starRating = Math.max(
    3,
    Math.min(5, parseInt(String(body.star_rating ?? 5), 10)),
  );
  if (artifactId <= 0) {
    err(res, 'Invalid artifact_id.');
    return;
  }
  if (!name) {
    err(res, 'Name is required.');
    return;
  }
  if (!ARTIFACT_CLASSES.includes(cls as (typeof ARTIFACT_CLASSES)[number])) {
    err(res, 'Invalid class.');
    return;
  }
  const db = getDbOrFail(res);
  if (!db) return;
  try {
    if (
      !q.updateArtifactDetails(db, artifactId, accountId, name, cls, starRating)
    ) {
      err(res, 'Artifact not found.', 404);
      return;
    }
    json(res, { success: true });
  } finally {
    db.close();
  }
}

export function handleAccounts(req: Request, res: Response): void {
  const userId = session(req).user_id;
  if (!userId) {
    err(res, 'Unauthorized', 401);
    return;
  }
  const accounts = getUserAccounts(userId);
  const currentId = session(req).account_id ?? null;
  json(res, { accounts, current_account_id: currentId });
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
  const body = getBody(req);
  const accountId = parseInt(String(body.account_id ?? 0), 10);
  if (accountId <= 0) {
    err(res, 'Invalid account_id.');
    return;
  }
  const result = switchAccount(userId, accountId);
  if (!result.success) {
    err(res, result.error);
    return;
  }
  const s = req.session as unknown as {
    account_id?: number;
    account_name?: string;
  };
  s.account_id = result.account.id;
  s.account_name = result.account.account_name;
  json(res, { success: true, account: result.account });
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
  const body = getBody(req);
  const name = String(body.account_name ?? '').trim();
  if (!name) {
    err(res, 'Account name is required.');
    return;
  }
  const accountsBefore = getUserAccounts(userId);
  const result = createGameAccount(userId, name);
  if (!result.success) {
    err(res, result.error);
    return;
  }
  if (accountsBefore.length === 0) {
    const s = req.session as unknown as {
      account_id?: number;
      account_name?: string;
    };
    s.account_id = result.account_id;
    s.account_name = name;
  }
  json(res, { success: true, account_id: result.account_id });
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
  const body = getBody(req);
  const accountId = parseInt(String(body.account_id ?? 0), 10);
  if (accountId <= 0) {
    err(res, 'Invalid account_id.');
    return;
  }
  const result = deleteGameAccount(userId, accountId);
  if (!result.success) {
    err(res, result.error);
    return;
  }
  const accounts = getUserAccounts(userId);
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
  const s = req.session as unknown as {
    user_id?: number;
    username?: string;
    is_admin?: boolean;
    account_id?: number | null;
    account_name?: string | null;
  };
  json(res, {
    user_id: s.user_id ?? null,
    username: s.username ?? null,
    is_admin: !!s.is_admin,
    account_id: s.account_id ?? null,
    account_name: s.account_name ?? null,
  });
}

export function handleAdminUsers(_req: Request, res: Response): void {
  if (!isAdmin((_req.session as { is_admin?: boolean }) ?? undefined)) {
    err(res, 'Admin access required.', 403);
    return;
  }
  const users = getAllUsers();
  json(res, { users });
}

export function handleAdminCreateUser(req: Request, res: Response): void {
  if (req.method !== 'POST') {
    err(res, 'POST method required.', 405);
    return;
  }
  if (!isAdmin(req.session as { is_admin?: boolean } | undefined)) {
    err(res, 'Admin access required.', 403);
    return;
  }
  const body = getBody(req);
  const username = String(body.username ?? '').trim();
  const password = String(body.password ?? '');
  const isAdminUser = Boolean(body.is_admin);
  const result = createUser(username, password, isAdminUser);
  if (!result.success) {
    err(res, result.error);
    return;
  }
  json(res, { success: true, user_id: result.user_id });
}

export function handleAdminDeleteUser(req: Request, res: Response): void {
  if (req.method !== 'POST') {
    err(res, 'POST method required.', 405);
    return;
  }
  if (!isAdmin(req.session as { is_admin?: boolean } | undefined)) {
    err(res, 'Admin access required.', 403);
    return;
  }
  const userId = session(req).user_id;
  if (!userId) {
    err(res, 'Unauthorized', 401);
    return;
  }
  const body = getBody(req);
  const targetId = parseInt(String(body.user_id ?? 0), 10);
  if (targetId <= 0) {
    err(res, 'Invalid user_id.');
    return;
  }
  const result = deleteUser(userId, targetId);
  if (!result.success) {
    err(res, result.error);
    return;
  }
  json(res, { success: true });
}

export function handleAdminResetPassword(req: Request, res: Response): void {
  if (req.method !== 'POST') {
    err(res, 'POST method required.', 405);
    return;
  }
  if (!isAdmin(req.session as { is_admin?: boolean } | undefined)) {
    err(res, 'Admin access required.', 403);
    return;
  }
  const body = getBody(req);
  const targetId = parseInt(String(body.user_id ?? 0), 10);
  const newPassword = String(body.password ?? '');
  if (targetId <= 0) {
    err(res, 'Invalid user_id.');
    return;
  }
  const result = changePassword(targetId, newPassword);
  if (!result.success) {
    err(res, result.error);
    return;
  }
  json(res, { success: true });
}

export function handleAdminBaseHeroes(_req: Request, res: Response): void {
  if (!isAdmin((_req.session as { is_admin?: boolean }) ?? undefined)) {
    err(res, 'Admin access required.', 403);
    return;
  }
  const db = getDbOrFail(res);
  if (!db) return;
  try {
    const heroes = db
      .prepare(
        'SELECT id, name, class, element, star_rating, display_order FROM base_heroes ORDER BY display_order ASC',
      )
      .all() as q.BaseHero[];
    json(res, { heroes });
  } finally {
    db.close();
  }
}

export function handleAdminBaseArtifacts(_req: Request, res: Response): void {
  if (!isAdmin((_req.session as { is_admin?: boolean }) ?? undefined)) {
    err(res, 'Admin access required.', 403);
    return;
  }
  const db = getDbOrFail(res);
  if (!db) return;
  try {
    const artifacts = db
      .prepare(
        'SELECT id, name, class, star_rating, display_order FROM base_artifacts ORDER BY display_order ASC',
      )
      .all() as q.BaseArtifact[];
    json(res, { artifacts });
  } finally {
    db.close();
  }
}

export function handleAdminAddBaseHero(req: Request, res: Response): void {
  if (req.method !== 'POST') {
    err(res, 'POST method required.', 405);
    return;
  }
  if (!isAdmin(req.session as { is_admin?: boolean } | undefined)) {
    err(res, 'Admin access required.', 403);
    return;
  }
  const body = getBody(req);
  const name = String(body.name ?? '').trim();
  const cls = String(body.class ?? '')
    .toLowerCase()
    .trim();
  const element = String(body.element ?? '')
    .toLowerCase()
    .trim();
  const starRating = Math.max(
    3,
    Math.min(5, parseInt(String(body.star_rating ?? 5), 10)),
  );
  if (!name) {
    err(res, 'Name is required.');
    return;
  }
  if (!HERO_CLASSES.includes(cls as (typeof HERO_CLASSES)[number])) {
    err(res, 'Invalid class.');
    return;
  }
  if (!ELEMENTS.includes(element as (typeof ELEMENTS)[number])) {
    err(res, 'Invalid element.');
    return;
  }
  const db = getDbOrFail(res);
  if (!db) return;
  try {
    const heroId = q.addBaseHero(db, name, cls, element, starRating);
    const row = db
      .prepare('SELECT display_order FROM base_heroes WHERE id = ?')
      .get(heroId) as { display_order: number };
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
  } finally {
    db.close();
  }
}

export function handleAdminAddBaseArtifact(req: Request, res: Response): void {
  if (req.method !== 'POST') {
    err(res, 'POST method required.', 405);
    return;
  }
  if (!isAdmin(req.session as { is_admin?: boolean } | undefined)) {
    err(res, 'Admin access required.', 403);
    return;
  }
  const body = getBody(req);
  const name = String(body.name ?? '').trim();
  const cls = String(body.class ?? '')
    .toLowerCase()
    .trim();
  const starRating = Math.max(
    3,
    Math.min(5, parseInt(String(body.star_rating ?? 5), 10)),
  );
  if (!name) {
    err(res, 'Name is required.');
    return;
  }
  if (!ARTIFACT_CLASSES.includes(cls as (typeof ARTIFACT_CLASSES)[number])) {
    err(res, 'Invalid class.');
    return;
  }
  const db = getDbOrFail(res);
  if (!db) return;
  try {
    const artifactId = q.addBaseArtifact(db, name, cls, starRating);
    const row = db
      .prepare('SELECT display_order FROM base_artifacts WHERE id = ?')
      .get(artifactId) as { display_order: number };
    q.addBaseArtifactToAllAccounts(
      db,
      artifactId,
      name,
      cls,
      starRating,
      row.display_order,
    );
    json(res, { success: true, artifact_id: artifactId });
  } finally {
    db.close();
  }
}

export function handleAdminDeleteBaseHero(req: Request, res: Response): void {
  if (req.method !== 'POST') {
    err(res, 'POST method required.', 405);
    return;
  }
  if (!isAdmin(req.session as { is_admin?: boolean } | undefined)) {
    err(res, 'Admin access required.', 403);
    return;
  }
  const body = getBody(req);
  const heroId = parseInt(String(body.hero_id ?? 0), 10);
  if (heroId <= 0) {
    err(res, 'Invalid hero_id.');
    return;
  }
  const db = getDbOrFail(res);
  if (!db) return;
  try {
    q.deleteBaseHero(db, heroId);
    json(res, { success: true });
  } finally {
    db.close();
  }
}

export function handleAdminDeleteBaseArtifact(
  req: Request,
  res: Response,
): void {
  if (req.method !== 'POST') {
    err(res, 'POST method required.', 405);
    return;
  }
  if (!isAdmin(req.session as { is_admin?: boolean } | undefined)) {
    err(res, 'Admin access required.', 403);
    return;
  }
  const body = getBody(req);
  const artifactId = parseInt(String(body.artifact_id ?? 0), 10);
  if (artifactId <= 0) {
    err(res, 'Invalid artifact_id.');
    return;
  }
  const db = getDbOrFail(res);
  if (!db) return;
  try {
    q.deleteBaseArtifact(db, artifactId);
    json(res, { success: true });
  } finally {
    db.close();
  }
}
