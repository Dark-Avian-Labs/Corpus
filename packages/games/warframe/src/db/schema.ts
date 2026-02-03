import Database from 'better-sqlite3';

import { WARFRAME_DB_PATH } from '../config.js';

/**
 * When confirmReset is true: drops all tables and recreates (destructive).
 * When confirmReset is false: no-op (use for idempotent init or migrations).
 */
export function createSchema(
  db: Database.Database,
  confirmReset: boolean,
): void {
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

let dbInstance: Database.Database | null = null;

export function getDb(): Database.Database {
  if (dbInstance !== null) return dbInstance;
  const instance = new Database(WARFRAME_DB_PATH);
  const originalClose = instance.close.bind(instance);
  instance.close = ((...args: Parameters<typeof originalClose>) => {
    const result = originalClose(...args);
    dbInstance = null;
    return result;
  }) as typeof instance.close;
  instance.pragma('foreign_keys = ON');
  dbInstance = instance;
  return instance;
}

export function closeDb(): void {
  if (dbInstance !== null) {
    dbInstance.close();
    dbInstance = null;
  }
}
