import type { GameModule, GameMountOptions } from '@corpus/core';
import express, { type Application } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

import { WARFRAME_DB_PATH } from './config.js';
import { getDb } from './db/schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getAssetsPath(): string {
  return path.join(__dirname, '..', 'assets');
}

const ACCENT_COLOR = '#ea580c';

export const warframeGame: GameModule = {
  id: 'warframe',
  name: 'Warframe',

  getDbPath: () => WARFRAME_DB_PATH,
  getDb,

  theme: { primary: ACCENT_COLOR },

  mount(app: Application, basePath: string, options?: GameMountOptions) {
    const base = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;
    const assetsPath = getAssetsPath();
    const pkgRoot = path.join(__dirname, '..');
    app.get(`${base}/favicon.ico`, (_req, res) => {
      res.sendFile(path.join(pkgRoot, 'favicon.ico'), (err) => {
        if (err) {
          if (!res.headersSent) res.status(404).end();
          else res.end();
        }
      });
    });
    app.use(`${base}/assets`, express.static(assetsPath));
    void options;
  },

  async applyDefaultsForNewUser(userId: number): Promise<void> {
    let db: ReturnType<typeof getDb> | null = null;
    try {
      db = getDb();
      await new Promise<void>((resolve) => {
        db?.prepare(
          'INSERT OR IGNORE INTO worksheets (user_id, name, display_order) VALUES (?, ?, ?)',
        ).run(userId, 'Warframes', 0);
        resolve();
      });
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
