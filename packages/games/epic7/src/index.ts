import type { GameModule, GameMountOptions } from '@corpus/core';
import express, { type Application } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { EPIC7_DB_PATH } from './config.js';
import {
  seedAccountHeroesFromBase,
  seedAccountArtifactsFromBase,
  getGameAccountsByUserId,
  createGameAccount,
} from './db/queries.js';
import { getDb } from './db/schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getAssetsPath(): string {
  return path.join(__dirname, '..', 'assets');
}

const ACCENT_COLOR = '#a855f7';

export const epic7Game: GameModule = {
  id: 'epic7',
  name: 'Epic Seven',

  getDbPath: () => EPIC7_DB_PATH,
  getDb,

  theme: { primary: ACCENT_COLOR },

  mount(app: Application, basePath: string, _options?: GameMountOptions) {
    const base = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;
    const assetsPath = getAssetsPath();
    const pkgRoot = path.join(__dirname, '..');
    const icoPath = path.join(pkgRoot, 'favicon.ico');
    const pngFallback = path.join(assetsPath, 'icons', 'favicon.png');
    let cachedFaviconPath: string | null = null;
    let cachedFaviconIsPng = false;
    if (fs.existsSync(icoPath)) {
      cachedFaviconPath = icoPath;
    } else if (fs.existsSync(pngFallback)) {
      cachedFaviconPath = pngFallback;
      cachedFaviconIsPng = true;
    }
    app.get(`${base}/favicon.ico`, (_req, res) => {
      if (cachedFaviconPath === null) {
        res.status(404).end();
        return;
      }
      if (cachedFaviconIsPng) res.type('image/png');
      res.sendFile(cachedFaviconPath, (err) => {
        if (err) {
          if (!res.headersSent) res.status(404).end();
          else res.end();
        }
      });
    });
    app.use(`${base}/assets`, express.static(assetsPath));
  },

  applyDefaultsForNewUser(userId: number): Promise<void> {
    let db: ReturnType<typeof getDb> | null = null;
    try {
      const dbInstance = getDb();
      db = dbInstance;
      const run = dbInstance.transaction(() => {
        const accounts = getGameAccountsByUserId(dbInstance, userId);
        if (accounts.length > 0) return;
        const accountId = createGameAccount(
          dbInstance,
          userId,
          'Default',
          true,
        );
        seedAccountHeroesFromBase(dbInstance, accountId);
        seedAccountArtifactsFromBase(dbInstance, accountId);
      });
      run();
      return Promise.resolve();
    } catch (err) {
      if (
        err &&
        typeof err === 'object' &&
        'code' in err &&
        (err as { code: string }).code === 'SQLITE_CONSTRAINT_UNIQUE'
      ) {
        return Promise.resolve();
      }
      return Promise.reject(err);
    } finally {
      if (db) {
        try {
          db.close();
        } catch {
          // Ignore close errors
        }
      }
    }
  },
};
