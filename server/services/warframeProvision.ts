import fs from 'fs';

import { warframeQueries as q } from '@codex/game-warframe';
import type Database from 'better-sqlite3';

import { ARMORY_DB_PATH } from '../config.js';
import { log } from '../logger.js';
import { ensureWarframeWorksheetsForUser, runWarframeSync } from './warframeSync.js';

export function provisionWarframeUserIfNeeded(codexDb: Database.Database, userId: number): void {
  if (q.getWorksheets(codexDb, userId).length > 0) {
    return;
  }

  let provisionedBySync = false;
  if (fs.existsSync(ARMORY_DB_PATH)) {
    try {
      runWarframeSync(codexDb, {
        execute: true,
        userIds: [userId],
        initiatedByUserId: userId,
      });
      provisionedBySync = true;
    } catch (err) {
      log('warn', 'Warframe auto-provision sync failed', {
        userId,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (!provisionedBySync || q.getWorksheets(codexDb, userId).length === 0) {
    ensureWarframeWorksheetsForUser(codexDb, userId);
  }
}
