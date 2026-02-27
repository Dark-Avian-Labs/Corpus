import { requireGameAccess } from '@corpus/core';
import { validateBody } from '@corpus/core/validation';
import { Router, type Request, type Response } from 'express';
import fs from 'fs';

import {
  ARTIFACT_CLASSES,
  ARTIFACT_GAUGE_MAX,
  ELEMENTS,
  EPIC7_DB_PATH,
  HERO_CLASSES,
} from '../../packages/games/epic7/src/config.js';
import * as q from '../../packages/games/epic7/src/db/queries.js';
import { getDb as getEpic7Db } from '../../packages/games/epic7/src/db/schema.js';
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
} from '../../packages/games/epic7/src/routes/validation.js';
import { requireAdmin, requireAuthApi } from '../auth/middleware.js';

export const epic7ApiRouter = Router();

epic7ApiRouter.use(requireAuthApi, requireGameAccess('epic7'));

type Epic7Session = {
  user_id?: number;
  account_id?: number | null;
  account_name?: string | null;
};

function session(req: Request): Epic7Session {
  return req.session as Epic7Session;
}

function json(res: Response, data: object, status = 200): void {
  res.status(status).json(data);
}

function err(res: Response, message: string, status = 400): void {
  res.status(status).json({ error: message });
}

function getDbOrFail(res: Response): ReturnType<typeof getEpic7Db> | null {
  if (!fs.existsSync(EPIC7_DB_PATH)) {
    err(res, 'Database not found. Please initialize the database.', 500);
    return null;
  }
  try {
    return getEpic7Db();
  } catch {
    err(res, 'Database connection failed.', 500);
    return null;
  }
}

epic7ApiRouter.get('/worksheets', (_req, res) => {
  json(res, {
    worksheets: [
      { id: 'heroes', name: 'Heroes' },
      { id: 'artifacts', name: 'Artifacts' },
    ],
  });
});

epic7ApiRouter.get('/heroes', (req, res) => {
  const accountId = session(req).account_id;
  if (!accountId) {
    err(res, 'No game account selected. Please create one first.');
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
});

epic7ApiRouter.get('/artifacts', (req, res) => {
  const accountId = session(req).account_id;
  if (!accountId) {
    err(res, 'No game account selected. Please create one first.');
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
});

epic7ApiRouter.patch('/heroes/:heroId/rating', (req, res) => {
  const accountId = session(req).account_id;
  if (!accountId) {
    err(res, 'No game account selected.');
    return;
  }
  const data = validateBody(
    updateHeroSchema,
    { ...req.body, hero_id: Number(req.params.heroId) },
    res,
  );
  if (!data) return;
  const db = getDbOrFail(res);
  if (!db) return;
  if (!q.updateHeroRating(db, data.hero_id, accountId, data.rating)) {
    err(res, 'Hero not found.', 404);
    return;
  }
  json(res, { success: true, rating: data.rating });
});

epic7ApiRouter.patch('/artifacts/:artifactId/gauge', (req, res) => {
  const accountId = session(req).account_id;
  if (!accountId) {
    err(res, 'No game account selected.');
    return;
  }
  const data = validateBody(
    updateArtifactSchema,
    { ...req.body, artifact_id: Number(req.params.artifactId) },
    res,
  );
  if (!data) return;
  const db = getDbOrFail(res);
  if (!db) return;
  if (!q.updateArtifactGauge(db, data.artifact_id, accountId, data.gauge_level)) {
    err(res, 'Artifact not found.', 404);
    return;
  }
  json(res, { success: true, gauge_level: data.gauge_level });
});

epic7ApiRouter.post('/heroes', (req, res) => {
  const accountId = session(req).account_id;
  if (!accountId) {
    err(res, 'No game account selected.');
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
});

epic7ApiRouter.post('/artifacts', (req, res) => {
  const accountId = session(req).account_id;
  if (!accountId) {
    err(res, 'No game account selected.');
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
});

epic7ApiRouter.patch('/heroes/:heroId/details', (req, res) => {
  const accountId = session(req).account_id;
  if (!accountId) {
    err(res, 'No game account selected.');
    return;
  }
  const data = validateBody(
    updateHeroDetailsSchema,
    { ...req.body, hero_id: Number(req.params.heroId) },
    res,
  );
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
});

epic7ApiRouter.patch('/artifacts/:artifactId/details', (req, res) => {
  const accountId = session(req).account_id;
  if (!accountId) {
    err(res, 'No game account selected.');
    return;
  }
  const data = validateBody(
    updateArtifactDetailsSchema,
    { ...req.body, artifact_id: Number(req.params.artifactId) },
    res,
  );
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
});

epic7ApiRouter.delete('/heroes/:heroId', (req, res) => {
  const accountId = session(req).account_id;
  if (!accountId) {
    err(res, 'No game account selected.');
    return;
  }
  const data = validateBody(
    deleteHeroSchema,
    { hero_id: Number(req.params.heroId) },
    res,
  );
  if (!data) return;
  const db = getDbOrFail(res);
  if (!db) return;
  if (!q.deleteHero(db, data.hero_id, accountId)) {
    err(res, 'Hero not found.', 404);
    return;
  }
  json(res, { success: true });
});

epic7ApiRouter.delete('/artifacts/:artifactId', (req, res) => {
  const accountId = session(req).account_id;
  if (!accountId) {
    err(res, 'No game account selected.');
    return;
  }
  const data = validateBody(
    deleteArtifactSchema,
    { artifact_id: Number(req.params.artifactId) },
    res,
  );
  if (!data) return;
  const db = getDbOrFail(res);
  if (!db) return;
  if (!q.deleteArtifact(db, data.artifact_id, accountId)) {
    err(res, 'Artifact not found.', 404);
    return;
  }
  json(res, { success: true });
});

epic7ApiRouter.get('/accounts', (req, res) => {
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
    const firstActive = accounts.find((account) => account.is_active === 1);
    const first = firstActive ?? accounts[0];
    currentId = first.id;
    req.session.account_id = first.id;
    req.session.account_name = first.account_name;
  }
  json(res, {
    accounts: accounts.map((account) => ({
      id: account.id,
      account_name: account.account_name,
      is_active: account.is_active,
      created_at: account.created_at,
    })),
    current_account_id: currentId,
  });
});

epic7ApiRouter.post('/accounts/switch', (req, res) => {
  const userId = session(req).user_id;
  if (!userId) {
    err(res, 'Unauthorized', 401);
    return;
  }
  const data = validateBody(switchAccountSchema, req.body, res);
  if (!data) return;
  const db = getDbOrFail(res);
  if (!db) return;
  const account = q.getGameAccountByIdAndUser(db, data.account_id, userId);
  if (!account) {
    err(res, 'Account not found.');
    return;
  }
  q.setActiveAccount(db, userId, data.account_id);
  req.session.account_id = account.id;
  req.session.account_name = account.account_name;
  json(res, {
    success: true,
    account: { id: account.id, account_name: account.account_name },
  });
});

epic7ApiRouter.post('/accounts', (req, res) => {
  const userId = session(req).user_id;
  if (!userId) {
    err(res, 'Unauthorized', 401);
    return;
  }
  const data = validateBody(addAccountSchema, req.body, res);
  if (!data) return;
  const db = getDbOrFail(res);
  if (!db) return;
  const existing = q.getAccountByNameAndUser(db, userId, data.account_name);
  if (existing) {
    err(res, 'An account with this name already exists.');
    return;
  }
  const accountsBefore = q.getGameAccountsByUserId(db, userId);
  const isFirst = accountsBefore.length === 0;
  const accountId = q.createGameAccount(db, userId, data.account_name, isFirst);
  if (isFirst) {
    req.session.account_id = accountId;
    req.session.account_name = data.account_name;
    q.seedAccountHeroesFromBase(db, accountId);
    q.seedAccountArtifactsFromBase(db, accountId);
  }
  json(res, { success: true, account_id: accountId });
});

epic7ApiRouter.delete('/accounts/:accountId', (req, res) => {
  const userId = session(req).user_id;
  if (!userId) {
    err(res, 'Unauthorized', 401);
    return;
  }
  const data = validateBody(
    deleteAccountSchema,
    { account_id: Number(req.params.accountId) },
    res,
  );
  if (!data) return;
  const db = getDbOrFail(res);
  if (!db) return;
  if (!q.deleteGameAccount(db, data.account_id, userId)) {
    err(res, 'Account not found.');
    return;
  }
  const accounts = q.getGameAccountsByUserId(db, userId);
  const stillCurrent = session(req).account_id === data.account_id;
  if (stillCurrent && accounts.length > 0) {
    req.session.account_id = accounts[0].id;
    req.session.account_name = accounts[0].account_name;
  } else if (stillCurrent) {
    req.session.account_id = null;
    req.session.account_name = null;
  }
  json(res, { success: true });
});

epic7ApiRouter.get('/user', (req, res) => {
  const s = session(req);
  json(res, {
    user_id: s.user_id ?? null,
    username: req.session.username ?? null,
    is_admin: !!req.session.is_admin,
    account_id: s.account_id ?? null,
    account_name: s.account_name ?? null,
  });
});

epic7ApiRouter.get('/admin/base/heroes', requireAdmin, (_req, res) => {
  const db = getDbOrFail(res);
  if (!db) return;
  const heroes = db
    .prepare(
      'SELECT id, name, class, element, star_rating, display_order FROM base_heroes ORDER BY display_order ASC',
    )
    .all();
  json(res, { heroes });
});

epic7ApiRouter.get('/admin/base/artifacts', requireAdmin, (_req, res) => {
  const db = getDbOrFail(res);
  if (!db) return;
  const artifacts = db
    .prepare(
      'SELECT id, name, class, star_rating, display_order FROM base_artifacts ORDER BY display_order ASC',
    )
    .all();
  json(res, { artifacts });
});

epic7ApiRouter.post('/admin/base/heroes', requireAdmin, (req, res) => {
  const data = validateBody(adminAddBaseHeroSchema, req.body, res);
  if (!data) return;
  const db = getDbOrFail(res);
  if (!db) return;
  const createBaseHero = db.transaction(() => {
    const heroId = q.addBaseHero(
      db,
      data.name,
      data.class,
      data.element,
      data.star_rating,
    );
    if (!heroId) {
      throw new Error('Failed to create base hero.');
    }
    const row = db
      .prepare('SELECT display_order FROM base_heroes WHERE id = ?')
      .get(heroId) as { display_order: number } | undefined;
    if (row == null) {
      throw new Error('Failed to create base hero.');
    }
    q.addBaseHeroToAllAccounts(
      db,
      heroId,
      data.name,
      data.class,
      data.element,
      data.star_rating,
      row.display_order,
    );
    return heroId;
  });
  try {
    const heroId = createBaseHero();
    json(res, { success: true, hero_id: heroId });
  } catch (e) {
    console.error('Failed to create base hero:', e);
    err(res, 'Failed to create base hero.');
  }
});

epic7ApiRouter.post('/admin/base/artifacts', requireAdmin, (req, res) => {
  const data = validateBody(adminAddBaseArtifactSchema, req.body, res);
  if (!data) return;
  const db = getDbOrFail(res);
  if (!db) return;
  try {
    db.exec('BEGIN');
    const artifactId = q.addBaseArtifact(
      db,
      data.name,
      data.class,
      data.star_rating,
    );
    if (!artifactId) {
      throw new Error('Failed to create base artifact.');
    }
    const row = db
      .prepare('SELECT display_order FROM base_artifacts WHERE id = ?')
      .get(artifactId) as { display_order: number } | undefined;
    if (row == null) {
      throw new Error('Failed to create base artifact.');
    }
    q.addBaseArtifactToAllAccounts(
      db,
      artifactId,
      data.name,
      data.class,
      data.star_rating,
      row.display_order,
    );
    db.exec('COMMIT');
    json(res, { success: true, artifact_id: artifactId });
  } catch (e) {
    try {
      db.exec('ROLLBACK');
    } catch (rollbackError) {
      console.error('Failed to rollback base artifact creation:', rollbackError);
    }
    console.error('Failed to create base artifact:', e);
    err(res, 'Failed to create base artifact.');
  }
});

epic7ApiRouter.delete('/admin/base/heroes/:heroId', requireAdmin, (req, res) => {
  const data = validateBody(
    adminDeleteBaseHeroSchema,
    { hero_id: Number(req.params.heroId) },
    res,
  );
  if (!data) return;
  const db = getDbOrFail(res);
  if (!db) return;
  const deleted = q.deleteBaseHero(db, data.hero_id);
  if (!deleted) {
    err(res, 'Base hero not found', 404);
    return;
  }
  json(res, { success: true });
});

epic7ApiRouter.delete(
  '/admin/base/artifacts/:artifactId',
  requireAdmin,
  (req, res) => {
    const data = validateBody(
      adminDeleteBaseArtifactSchema,
      { artifact_id: Number(req.params.artifactId) },
      res,
    );
    if (!data) return;
    const db = getDbOrFail(res);
    if (!db) return;
    const deleted = q.deleteBaseArtifact(db, data.artifact_id);
    if (!deleted) {
      err(res, 'Base artifact not found', 404);
      return;
    }
    json(res, { success: true });
  },
);
