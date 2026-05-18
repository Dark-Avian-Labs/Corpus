import { requireGameAccess } from '@codex/core';
import { validateBody } from '@codex/core/validation';
import {
  ARTIFACT_GAUGE_MAX,
  epic7AddAccountSchema,
  epic7AddArtifactSchema,
  epic7AddHeroSchema,
  epic7AdminAddBaseArtifactSchema,
  epic7AdminAddBaseHeroSchema,
  epic7AdminDeleteBaseArtifactSchema,
  epic7AdminDeleteBaseHeroSchema,
  epic7DeleteAccountSchema,
  epic7DeleteArtifactSchema,
  epic7DeleteHeroSchema,
  epic7Queries as q,
  epic7SwitchAccountSchema,
  epic7UpdateAccountSchema,
  epic7UpdateArtifactDetailsSchema,
  epic7UpdateArtifactSchema,
  epic7UpdateHeroDetailsSchema,
  epic7UpdateHeroSchema,
  getEpic7Db,
} from '@codex/game-epic7';
import { Router, type Request, type Response } from 'express';

import { requireGameAdmin } from '../auth/middleware.js';
import { isEpic7DbAvailable } from '../epic7DbState.js';
import { log } from '../logger.js';

export const epic7ApiRouter = Router();

epic7ApiRouter.use(requireGameAccess('epic7'));

type Epic7Session = {
  user_id?: number;
  username?: string;
  is_admin?: boolean;
  account_id?: number | null;
  account_name?: string | null;
};

function session(req: Request): Epic7Session {
  return req.session as Epic7Session;
}

function patchEpic7Session(req: Request, values: Partial<Epic7Session>): void {
  Object.assign(req.session as Epic7Session, values);
}

function json(res: Response, data: object, status = 200): void {
  res.status(status).json(data);
}

function err(res: Response, message: string, status = 400): void {
  res.status(status).json({ error: message });
}

function getDbOrFail(res: Response): ReturnType<typeof getEpic7Db> | null {
  if (!isEpic7DbAvailable()) {
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

type Epic7Database = ReturnType<typeof getEpic7Db>;

function resolveAccountId(db: Epic7Database, req: Request, userId: number): number | null {
  const fromSession = session(req).account_id;
  if (typeof fromSession === 'number' && fromSession > 0) {
    return fromSession;
  }
  const accounts = q.getUserAccountsForApi(db, userId);
  const active = accounts.find((account) => account.is_active === 1);
  return active?.id ?? null;
}

function runWithDb(res: Response, fn: (db: Epic7Database) => void | Promise<void>): void {
  void (async () => {
    const db = getDbOrFail(res);
    if (!db) return;
    try {
      await fn(db);
    } catch (error) {
      if (res.headersSent) {
        log('error', 'Epic7 handler failed after response started', {
          err: error instanceof Error ? error.message : String(error),
        });
        return;
      }
      log('error', 'Epic7 request failed', {
        err: error instanceof Error ? (error.stack ?? error.message) : String(error),
      });
      err(res, 'Internal server error', 500);
    }
  })();
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
  runWithDb(res, (db) => {
    const userId = session(req).user_id;
    if (!userId) {
      err(res, 'Unauthorized', 401);
      return;
    }
    const accountId = resolveAccountId(db, req, userId);
    if (!accountId) {
      err(res, 'No game account selected. Please create one first.');
      return;
    }
    const classFilter = String(req.query.class ?? '').trim();
    const elementFilter = String(req.query.element ?? '').trim();
    const heroes = q.getHeroes(db, accountId, classFilter, elementFilter);
    json(res, { heroes });
  });
});

epic7ApiRouter.get('/artifacts', (req, res) => {
  runWithDb(res, (db) => {
    const userId = session(req).user_id;
    if (!userId) {
      err(res, 'Unauthorized', 401);
      return;
    }
    const accountId = resolveAccountId(db, req, userId);
    if (!accountId) {
      err(res, 'No game account selected. Please create one first.');
      return;
    }
    const classFilter = String(req.query.class ?? '').trim();
    const artifacts = q.getArtifacts(db, accountId, classFilter);
    json(res, {
      artifacts,
      gauge_max: ARTIFACT_GAUGE_MAX,
    });
  });
});

function requireAccountId(db: Epic7Database, req: Request, res: Response): number | null {
  const userId = session(req).user_id;
  if (!userId) {
    err(res, 'Unauthorized', 401);
    return null;
  }
  const accountId = resolveAccountId(db, req, userId);
  if (!accountId) {
    err(res, 'No game account selected. Please create one first.');
    return null;
  }
  return accountId;
}

epic7ApiRouter.patch('/heroes/:heroId/rating', (req, res) => {
  runWithDb(res, (db) => {
    const accountId = requireAccountId(db, req, res);
    if (!accountId) return;
    const data = validateBody(
      epic7UpdateHeroSchema,
      { ...req.body, hero_id: Number(req.params.heroId) },
      res,
    );
    if (!data) return;
    if (!q.updateHeroRating(db, data.hero_id, accountId, data.rating)) {
      err(res, 'Hero not found.', 404);
      return;
    }
    json(res, { success: true, rating: data.rating });
  });
});

epic7ApiRouter.patch('/artifacts/:artifactId/gauge', (req, res) => {
  runWithDb(res, (db) => {
    const accountId = requireAccountId(db, req, res);
    if (!accountId) return;
    const data = validateBody(
      epic7UpdateArtifactSchema,
      { ...req.body, artifact_id: Number(req.params.artifactId) },
      res,
    );
    if (!data) return;
    if (!q.updateArtifactGauge(db, data.artifact_id, accountId, data.gauge_level)) {
      err(res, 'Artifact not found.', 404);
      return;
    }
    json(res, { success: true, gauge_level: data.gauge_level });
  });
});

epic7ApiRouter.post('/heroes', (req, res) => {
  runWithDb(res, (db) => {
    const accountId = requireAccountId(db, req, res);
    if (!accountId) return;
    const data = validateBody(epic7AddHeroSchema, req.body, res);
    if (!data) return;
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
});

epic7ApiRouter.post('/artifacts', (req, res) => {
  runWithDb(res, (db) => {
    const accountId = requireAccountId(db, req, res);
    if (!accountId) return;
    const data = validateBody(epic7AddArtifactSchema, req.body, res);
    if (!data) return;
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
});

epic7ApiRouter.patch('/heroes/:heroId/details', (req, res) => {
  runWithDb(res, (db) => {
    const accountId = requireAccountId(db, req, res);
    if (!accountId) return;
    const data = validateBody(
      epic7UpdateHeroDetailsSchema,
      { ...req.body, hero_id: Number(req.params.heroId) },
      res,
    );
    if (!data) return;
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
});

epic7ApiRouter.patch('/artifacts/:artifactId/details', (req, res) => {
  runWithDb(res, (db) => {
    const accountId = requireAccountId(db, req, res);
    if (!accountId) return;
    const data = validateBody(
      epic7UpdateArtifactDetailsSchema,
      { ...req.body, artifact_id: Number(req.params.artifactId) },
      res,
    );
    if (!data) return;
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
});

epic7ApiRouter.delete('/heroes/:heroId', (req, res) => {
  runWithDb(res, (db) => {
    const accountId = requireAccountId(db, req, res);
    if (!accountId) return;
    const data = validateBody(epic7DeleteHeroSchema, { hero_id: Number(req.params.heroId) }, res);
    if (!data) return;
    if (!q.deleteHero(db, data.hero_id, accountId)) {
      err(res, 'Hero not found.', 404);
      return;
    }
    json(res, { success: true });
  });
});

epic7ApiRouter.delete('/artifacts/:artifactId', (req, res) => {
  runWithDb(res, (db) => {
    const accountId = requireAccountId(db, req, res);
    if (!accountId) return;
    const data = validateBody(
      epic7DeleteArtifactSchema,
      { artifact_id: Number(req.params.artifactId) },
      res,
    );
    if (!data) return;
    if (!q.deleteArtifact(db, data.artifact_id, accountId)) {
      err(res, 'Artifact not found.', 404);
      return;
    }
    json(res, { success: true });
  });
});

epic7ApiRouter.get('/accounts', (req, res) => {
  runWithDb(res, (db) => {
    const userId = session(req).user_id;
    if (!userId) {
      err(res, 'Unauthorized', 401);
      return;
    }
    const accounts = q.getUserAccountsForApi(db, userId);
    const active = accounts.find((account) => account.is_active === 1);
    const currentId = session(req).account_id ?? active?.id ?? null;
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
});

epic7ApiRouter.post('/accounts/switch', (req, res) => {
  runWithDb(res, (db) => {
    const userId = session(req).user_id;
    if (!userId) {
      err(res, 'Unauthorized', 401);
      return;
    }
    const data = validateBody(epic7SwitchAccountSchema, req.body, res);
    if (!data) return;
    const account = q.getGameAccountByIdAndUser(db, data.account_id, userId);
    if (!account) {
      err(res, 'Account not found.');
      return;
    }
    q.setActiveAccount(db, userId, data.account_id);
    patchEpic7Session(req, { account_id: account.id, account_name: account.account_name });
    json(res, {
      success: true,
      account: { id: account.id, account_name: account.account_name },
    });
  });
});

epic7ApiRouter.post('/accounts', (req, res) => {
  runWithDb(res, (db) => {
    const userId = session(req).user_id;
    if (!userId) {
      err(res, 'Unauthorized', 401);
      return;
    }
    const data = validateBody(epic7AddAccountSchema, req.body, res);
    if (!data) return;
    const existing = q.getAccountByNameAndUser(db, userId, data.account_name);
    if (existing) {
      err(res, 'An account with this name already exists.');
      return;
    }
    const accountsBefore = q.getGameAccountsByUserId(db, userId);
    const isFirst = accountsBefore.length === 0;
    const accountId = q.createGameAccount(db, userId, data.account_name, isFirst);
    q.seedAccountHeroesFromBase(db, accountId);
    q.seedAccountArtifactsFromBase(db, accountId);
    if (isFirst) {
      patchEpic7Session(req, { account_id: accountId, account_name: data.account_name });
    }
    json(res, { success: true, account_id: accountId });
  });
});

epic7ApiRouter.patch('/accounts/:accountId', (req, res) => {
  runWithDb(res, (db) => {
    const userId = session(req).user_id;
    if (!userId) {
      err(res, 'Unauthorized', 401);
      return;
    }
    const data = validateBody(
      epic7UpdateAccountSchema,
      {
        account_id: Number(req.params.accountId),
        account_name: req.body?.account_name,
      },
      res,
    );
    if (!data) return;
    const existingById = q.getGameAccountByIdAndUser(db, data.account_id, userId);
    if (!existingById) {
      err(res, 'Account not found.', 404);
      return;
    }
    const duplicate = q.getAccountByNameAndUser(db, userId, data.account_name);
    if (duplicate && duplicate.id !== data.account_id) {
      err(res, 'An account with this name already exists.');
      return;
    }
    if (!q.updateGameAccountName(db, data.account_id, userId, data.account_name)) {
      err(res, 'Failed to update account name.');
      return;
    }
    if (session(req).account_id === data.account_id) {
      patchEpic7Session(req, { account_name: data.account_name });
    }
    json(res, {
      success: true,
      account: { id: data.account_id, account_name: data.account_name },
    });
  });
});

epic7ApiRouter.delete('/accounts/:accountId', (req, res) => {
  runWithDb(res, (db) => {
    const userId = session(req).user_id;
    if (!userId) {
      err(res, 'Unauthorized', 401);
      return;
    }
    const data = validateBody(
      epic7DeleteAccountSchema,
      { account_id: Number(req.params.accountId) },
      res,
    );
    if (!data) return;
    if (!q.deleteGameAccount(db, data.account_id, userId)) {
      err(res, 'Account not found.');
      return;
    }
    const accounts = q.getGameAccountsByUserId(db, userId);
    const stillCurrent = session(req).account_id === data.account_id;
    if (stillCurrent && accounts.length > 0) {
      patchEpic7Session(req, {
        account_id: accounts[0].id,
        account_name: accounts[0].account_name,
      });
    } else if (stillCurrent) {
      patchEpic7Session(req, { account_id: null, account_name: null });
    }
    json(res, { success: true });
  });
});

epic7ApiRouter.get('/user', (req, res) => {
  const s = session(req);
  json(res, {
    user_id: s.user_id ?? null,
    username: s.username ?? null,
    is_admin: !!s.is_admin,
    account_id: s.account_id ?? null,
    account_name: s.account_name ?? null,
  });
});

epic7ApiRouter.get('/admin/base/heroes', requireGameAdmin, (_req, res) => {
  runWithDb(res, (db) => {
    const heroes = db
      .prepare(
        'SELECT id, name, class, element, star_rating, display_order FROM base_heroes ORDER BY display_order ASC',
      )
      .all();
    json(res, { heroes });
  });
});

epic7ApiRouter.get('/admin/base/artifacts', requireGameAdmin, (_req, res) => {
  runWithDb(res, (db) => {
    const artifacts = db
      .prepare(
        'SELECT id, name, class, star_rating, display_order FROM base_artifacts ORDER BY display_order ASC',
      )
      .all();
    json(res, { artifacts });
  });
});

epic7ApiRouter.post('/admin/base/heroes', requireGameAdmin, (req, res) => {
  runWithDb(res, (db) => {
    const data = validateBody(epic7AdminAddBaseHeroSchema, req.body, res);
    if (!data) return;
    const createBaseHero = db.transaction(() => {
      const heroId = q.addBaseHero(db, data.name, data.class, data.element, data.star_rating);
      if (!heroId) {
        throw new Error('Failed to create base hero.');
      }
      const row = db.prepare('SELECT display_order FROM base_heroes WHERE id = ?').get(heroId) as
        | { display_order: number }
        | undefined;
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
      log('error', 'Failed to create base hero', {
        err: e instanceof Error ? (e.stack ?? e.message) : String(e),
      });
      err(res, 'Failed to create base hero.');
    }
  });
});

epic7ApiRouter.post('/admin/base/artifacts', requireGameAdmin, (req, res) => {
  runWithDb(res, (db) => {
    const data = validateBody(epic7AdminAddBaseArtifactSchema, req.body, res);
    if (!data) return;
    const createBaseArtifact = db.transaction(() => {
      const artifactId = q.addBaseArtifact(db, data.name, data.class, data.star_rating);
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
      return artifactId;
    });
    try {
      const artifactId = createBaseArtifact();
      json(res, { success: true, artifact_id: artifactId });
    } catch (e) {
      log('error', 'Failed to create base artifact', {
        err: e instanceof Error ? (e.stack ?? e.message) : String(e),
      });
      err(res, 'Failed to create base artifact.');
    }
  });
});

epic7ApiRouter.delete('/admin/base/heroes/:heroId', requireGameAdmin, (req, res) => {
  runWithDb(res, (db) => {
    const data = validateBody(
      epic7AdminDeleteBaseHeroSchema,
      { hero_id: Number(req.params.heroId) },
      res,
    );
    if (!data) return;
    const deleted = q.deleteBaseHero(db, data.hero_id);
    if (!deleted) {
      err(res, 'Base hero not found', 404);
      return;
    }
    json(res, { success: true });
  });
});

epic7ApiRouter.delete('/admin/base/artifacts/:artifactId', requireGameAdmin, (req, res) => {
  runWithDb(res, (db) => {
    const data = validateBody(
      epic7AdminDeleteBaseArtifactSchema,
      { artifact_id: Number(req.params.artifactId) },
      res,
    );
    if (!data) return;
    const deleted = q.deleteBaseArtifact(db, data.artifact_id);
    if (!deleted) {
      err(res, 'Base artifact not found', 404);
      return;
    }
    json(res, { success: true });
  });
});
