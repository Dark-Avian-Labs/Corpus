import type { Request, Response } from 'express';
import fs from 'fs';

import {
  ARTIFACT_GAUGE_MAX,
  ARTIFACT_CLASSES,
  ELEMENTS,
  EPIC7_DB_PATH,
  HERO_CLASSES,
  HERO_RATINGS,
} from '../config.js';
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

function parsePositiveInt(value: unknown, fallback = 0): number | null {
  const str = value == null || value === '' ? String(fallback) : String(value);
  const n = parseInt(str, 10);
  if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) return null;
  return n;
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
  const body = getBody(req);
  const heroId = parsePositiveInt(body.hero_id);
  if (heroId === null) {
    err(res, 'Invalid hero_id.');
    return;
  }
  const rating = String(body.rating ?? '').trim();
  if (!HERO_RATINGS.includes(rating as (typeof HERO_RATINGS)[number])) {
    err(res, 'Invalid rating value.');
    return;
  }
  const db = getDbOrFail(res);
  if (!db) return;
  if (!q.updateHeroRating(db, heroId, accountId, rating)) {
    err(res, 'Hero not found.', 404);
    return;
  }
  json(res, { success: true, rating });
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
  const artifactId = parsePositiveInt(body.artifact_id);
  if (artifactId === null) {
    err(res, 'Invalid artifact_id.');
    return;
  }
  let gaugeLevelParsed = parseInt(String(body.gauge_level ?? 0), 10);
  if (!Number.isFinite(gaugeLevelParsed)) gaugeLevelParsed = 0;
  const gaugeLevel = Math.max(
    0,
    Math.min(ARTIFACT_GAUGE_MAX, gaugeLevelParsed),
  );
  const db = getDbOrFail(res);
  if (!db) return;
  if (!q.updateArtifactGauge(db, artifactId, accountId, gaugeLevel)) {
    err(res, 'Artifact not found.', 404);
    return;
  }
  json(res, { success: true, gauge_level: gaugeLevel });
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
  const starRatingRaw =
    body.star_rating === '' || body.star_rating == null
      ? 5
      : parseInt(String(body.star_rating), 10);
  const starRating = Number.isFinite(starRatingRaw)
    ? Math.max(3, Math.min(5, starRatingRaw))
    : 5;
  const baseHeroIdRaw =
    body.base_hero_id != null && body.base_hero_id !== ''
      ? body.base_hero_id
      : null;
  const baseHeroIdFinal =
    baseHeroIdRaw != null ? parsePositiveInt(baseHeroIdRaw) : null;
  if (baseHeroIdRaw != null && baseHeroIdFinal === null) {
    err(res, 'Invalid base_hero_id.');
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
  const heroId = q.addHero(
    db,
    accountId,
    name,
    cls,
    element,
    starRating,
    baseHeroIdFinal,
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
  const body = getBody(req);
  const name = String(body.name ?? '').trim();
  const cls = String(body.class ?? '')
    .toLowerCase()
    .trim();
  const starRatingRaw =
    body.star_rating === '' || body.star_rating == null
      ? 5
      : parseInt(String(body.star_rating), 10);
  const starRating = Number.isFinite(starRatingRaw)
    ? Math.max(3, Math.min(5, starRatingRaw))
    : 5;
  const baseArtifactIdRaw =
    body.base_artifact_id != null && body.base_artifact_id !== ''
      ? body.base_artifact_id
      : null;
  const baseArtifactIdFinal =
    baseArtifactIdRaw != null ? parsePositiveInt(baseArtifactIdRaw) : null;
  if (baseArtifactIdRaw != null && baseArtifactIdFinal === null) {
    err(res, 'Invalid base_artifact_id.');
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
  const artifactId = q.addArtifact(
    db,
    accountId,
    name,
    cls,
    starRating,
    baseArtifactIdFinal,
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
  const body = getBody(req);
  const heroId = parsePositiveInt(body.hero_id);
  if (heroId === null) {
    err(res, 'Invalid hero_id.');
    return;
  }
  const db = getDbOrFail(res);
  if (!db) return;
  if (!q.deleteHero(db, heroId, accountId)) {
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
  const body = getBody(req);
  const artifactId = parsePositiveInt(body.artifact_id);
  if (artifactId === null) {
    err(res, 'Invalid artifact_id.');
    return;
  }
  const db = getDbOrFail(res);
  if (!db) return;
  if (!q.deleteArtifact(db, artifactId, accountId)) {
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
  const body = getBody(req);
  const heroId = parsePositiveInt(body.hero_id);
  if (heroId === null) {
    err(res, 'Invalid hero_id.');
    return;
  }
  const name = String(body.name ?? '').trim();
  const cls = String(body.class ?? '')
    .toLowerCase()
    .trim();
  const element = String(body.element ?? '')
    .toLowerCase()
    .trim();
  const starRatingParsed = parseInt(String(body.star_rating ?? 5), 10);
  const starRating = Number.isFinite(starRatingParsed)
    ? Math.max(3, Math.min(5, starRatingParsed))
    : 5;
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
  if (
    !q.updateHeroDetails(db, heroId, accountId, name, cls, element, starRating)
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
  const body = getBody(req);
  const artifactId = parsePositiveInt(body.artifact_id);
  if (artifactId === null) {
    err(res, 'Invalid artifact_id.');
    return;
  }
  const name = String(body.name ?? '').trim();
  const cls = String(body.class ?? '')
    .toLowerCase()
    .trim();
  const starRatingParsed = parseInt(String(body.star_rating ?? 5), 10);
  const starRating = Number.isFinite(starRatingParsed)
    ? Math.max(3, Math.min(5, starRatingParsed))
    : 5;
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
  if (
    !q.updateArtifactDetails(db, artifactId, accountId, name, cls, starRating)
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
  // If session has no Epic7 account but user has accounts, set to first active or first account
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
  const body = getBody(req);
  const accountId = parsePositiveInt(body.account_id);
  if (accountId === null) {
    err(res, 'Invalid account_id.');
    return;
  }
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
  const body = getBody(req);
  const name = String(body.account_name ?? '').trim();
  if (!name) {
    err(res, 'Account name is required.');
    return;
  }
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
  const body = getBody(req);
  const accountId = parsePositiveInt(body.account_id);
  if (accountId === null) {
    err(res, 'Invalid account_id.');
    return;
  }
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
  const body = getBody(req);
  const name = String(body.name ?? '').trim();
  const cls = String(body.class ?? '')
    .toLowerCase()
    .trim();
  const element = String(body.element ?? '')
    .toLowerCase()
    .trim();
  const starRatingRaw = parseInt(String(body.star_rating ?? 5), 10);
  const starRating = Number.isFinite(starRatingRaw)
    ? Math.max(3, Math.min(5, starRatingRaw))
    : 5;
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
  const body = getBody(req);
  const name = String(body.name ?? '').trim();
  const cls = String(body.class ?? '')
    .toLowerCase()
    .trim();
  const starRatingRaw = parseInt(String(body.star_rating ?? 5), 10);
  const starRating = Number.isFinite(starRatingRaw)
    ? Math.max(3, Math.min(5, starRatingRaw))
    : 5;
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
  const body = getBody(req);
  const heroId = parsePositiveInt(body.hero_id);
  if (heroId === null) {
    err(res, 'Invalid hero_id.');
    return;
  }
  const db = getDbOrFail(res);
  if (!db) return;
  q.deleteBaseHero(db, heroId);
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
  const body = getBody(req);
  const artifactId = parsePositiveInt(body.artifact_id);
  if (artifactId === null) {
    err(res, 'Invalid artifact_id.');
    return;
  }
  const db = getDbOrFail(res);
  if (!db) return;
  q.deleteBaseArtifact(db, artifactId);
  json(res, { success: true });
}
