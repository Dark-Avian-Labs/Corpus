import { createDbSingleton } from '@codex/core';
import type Database from 'better-sqlite3';

import { WARFRAME_DB_PATH } from '../config.js';

export function createSchema(db: Database.Database, confirmReset: boolean): void {
  db.pragma('foreign_keys = ON');
  if (!confirmReset) return;
  db.exec(`
    DROP TABLE IF EXISTS cell_values;
    DROP TABLE IF EXISTS rows;
    DROP TABLE IF EXISTS columns;
    DROP TABLE IF EXISTS worksheets;
  `);
  db.exec(`
    CREATE TABLE worksheets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      display_order INTEGER NOT NULL DEFAULT 0,
      UNIQUE(user_id, name)
    );

    CREATE TABLE columns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      worksheet_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      display_order INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (worksheet_id) REFERENCES worksheets(id) ON DELETE CASCADE
    );

    CREATE TABLE rows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      worksheet_id INTEGER NOT NULL,
      item_name TEXT NOT NULL,
      display_order INTEGER NOT NULL DEFAULT 0,
      market_href TEXT,
      market_href_prime TEXT,
      FOREIGN KEY (worksheet_id) REFERENCES worksheets(id) ON DELETE CASCADE
    );

    CREATE TABLE cell_values (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      row_id INTEGER NOT NULL,
      column_id INTEGER NOT NULL,
      value TEXT NOT NULL DEFAULT '',
      FOREIGN KEY (row_id) REFERENCES rows(id) ON DELETE CASCADE,
      FOREIGN KEY (column_id) REFERENCES columns(id) ON DELETE CASCADE,
      UNIQUE(row_id, column_id)
    );

    CREATE INDEX idx_worksheets_user ON worksheets(user_id);
    CREATE INDEX idx_columns_worksheet ON columns(worksheet_id);
    CREATE INDEX idx_rows_worksheet ON rows(worksheet_id);
    CREATE INDEX idx_cell_values_row ON cell_values(row_id);
    CREATE INDEX idx_cell_values_column ON cell_values(column_id);
  `);
}

export function ensureWarframeRowMarketHrefColumns(db: Database.Database): void {
  const cols = db.prepare(`PRAGMA table_info(rows)`).all() as { name: string }[];
  if (!cols.some((c) => c.name === 'market_href')) {
    db.exec('ALTER TABLE rows ADD COLUMN market_href TEXT');
  }
  if (!cols.some((c) => c.name === 'market_href_prime')) {
    db.exec('ALTER TABLE rows ADD COLUMN market_href_prime TEXT');
  }
}

export function ensureWarframeAdvancedProgressTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS row_advanced_progress (
      row_id INTEGER PRIMARY KEY,
      level INTEGER NOT NULL DEFAULT 0,
      valence_percent INTEGER,
      has_element INTEGER NOT NULL DEFAULT 0,
      has_orokin INTEGER NOT NULL DEFAULT 0,
      has_arcane INTEGER NOT NULL DEFAULT 0,
      has_exilus INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (row_id) REFERENCES rows(id) ON DELETE CASCADE
    );
  `);
  const cols = db.prepare(`PRAGMA table_info(row_advanced_progress)`).all() as { name: string }[];
  const has = (name: string) => cols.some((c) => c.name === name);
  if (!has('level_prime'))
    db.exec('ALTER TABLE row_advanced_progress ADD COLUMN level_prime INTEGER');
  if (!has('valence_percent_prime'))
    db.exec('ALTER TABLE row_advanced_progress ADD COLUMN valence_percent_prime INTEGER');
  if (!has('has_element_prime'))
    db.exec('ALTER TABLE row_advanced_progress ADD COLUMN has_element_prime INTEGER');
  if (!has('has_orokin_prime'))
    db.exec('ALTER TABLE row_advanced_progress ADD COLUMN has_orokin_prime INTEGER');
  if (!has('has_arcane_prime'))
    db.exec('ALTER TABLE row_advanced_progress ADD COLUMN has_arcane_prime INTEGER');
  if (!has('has_exilus_prime'))
    db.exec('ALTER TABLE row_advanced_progress ADD COLUMN has_exilus_prime INTEGER');
}

const { getDb, closeDb } = createDbSingleton(WARFRAME_DB_PATH, {
  onOpen: (db) => {
    ensureWarframeRowMarketHrefColumns(db);
    ensureWarframeAdvancedProgressTable(db);
  },
});
export { getDb, closeDb };
