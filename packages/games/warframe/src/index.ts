import path from 'path';
import { fileURLToPath } from 'url';

import { log, type GameModule, type GameMountOptions } from '@codex/core';
import express, { type Application } from 'express';

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

  mount(app: Application, basePath: string, _options?: GameMountOptions) {
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
  },

  async applyDefaultsForNewUser(userId: number): Promise<void> {
    try {
      const db = getDb();
      db.prepare(
        'INSERT OR IGNORE INTO worksheets (user_id, name, display_order) VALUES (?, ?, ?)',
      ).run(userId, 'Warframes', 0);
    } catch (err) {
      log('error', 'Failed to apply Warframe defaults for new user', {
        userId,
        err: err instanceof Error ? (err.stack ?? err.message) : String(err),
      });
      throw err;
    }
  },
};

export {
  HELMINTH_NON_SUBSUMABLE_ITEM_NAMES,
  isHelminthNonSubsumableItemName,
  isValidHelminthCellValue,
} from './helminthExceptions.js';
export {
  HELMINTH_VALUES,
  VALID_STATUSES,
  VALENCE_COMPLETE_THRESHOLD,
  VALENCE_PERCENT_MAX_STORED,
  VALENCE_PERCENT_MIN,
  WARFRAME_DB_PATH,
  isHelminthValue,
  isValidStatus,
} from './config.js';
export { closeDb as closeWarframeDb, getDb as getWarframeDb } from './db/schema.js';
export * as warframeQueries from './db/queries.js';
export {
  addRowSchema as warframeAddRowSchema,
  adminUpdateSchema as warframeAdminUpdateSchema,
  deleteRowSchema as warframeDeleteRowSchema,
  editRowSchema as warframeEditRowSchema,
  updateAdvancedProgressSchema as warframeUpdateAdvancedProgressSchema,
  updateSchema as warframeUpdateSchema,
} from './routes/validation.js';
export {
  isPrimeVariantName,
  normalizeDisplayName,
  normalizeNameForKey,
  resolveCanonicalKey,
  stripPrimeSuffix,
} from './displayName.js';
export {
  WARFRAME_MARKET_API_DOCS_URL,
  warframeMarketItemSellUrl,
  warframeMarketSellHrefUsesPrimeOnlyItemSlug,
} from './marketUrls.js';
export {
  type VariantColumns,
  resolveVariantColumns,
  worksheetHasNormalAndPrimeColumns,
} from './variantColumns.js';
export {
  ABSOLUTE_MAX_ADVANCED_LEVEL,
  type AdvancedRowRelevance,
  isArcaneRelevant,
  isExilusRelevant,
  isPrimeItem,
  isPrimeWarframeOrWeapon,
  isValenceRelevant,
  maxLevelForRow,
  resolveAdvancedRowRelevance,
} from './advancedRules.js';
export {
  isExaltedWeaponItem,
  isExaltedWeaponWorksheet,
  shouldAutoCompleteOrokin,
} from './exaltedWeapons.js';
