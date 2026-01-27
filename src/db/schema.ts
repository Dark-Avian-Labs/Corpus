import Database from 'better-sqlite3';

import { SQLITE_DB_PATH } from '../config.js';

export function createSchema(db: Database.Database): void {
  db.exec(`
    DROP TABLE IF EXISTS account_artifacts;
    DROP TABLE IF EXISTS account_heroes;
    DROP TABLE IF EXISTS game_accounts;
    DROP TABLE IF EXISTS base_artifacts;
    DROP TABLE IF EXISTS base_heroes;
    DROP TABLE IF EXISTS users;

    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      is_admin INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE game_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      account_name TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE base_heroes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      class TEXT NOT NULL,
      element TEXT NOT NULL,
      star_rating INTEGER NOT NULL DEFAULT 5,
      display_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE base_artifacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      class TEXT NOT NULL,
      star_rating INTEGER NOT NULL DEFAULT 5,
      display_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE account_heroes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL,
      base_hero_id INTEGER,
      name TEXT NOT NULL,
      class TEXT NOT NULL,
      element TEXT NOT NULL,
      star_rating INTEGER NOT NULL DEFAULT 5,
      rating TEXT NOT NULL DEFAULT '-',
      display_order INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (account_id) REFERENCES game_accounts(id) ON DELETE CASCADE,
      FOREIGN KEY (base_hero_id) REFERENCES base_heroes(id) ON DELETE SET NULL
    );

    CREATE TABLE account_artifacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL,
      base_artifact_id INTEGER,
      name TEXT NOT NULL,
      class TEXT NOT NULL,
      star_rating INTEGER NOT NULL DEFAULT 5,
      gauge_level INTEGER NOT NULL DEFAULT 0,
      display_order INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (account_id) REFERENCES game_accounts(id) ON DELETE CASCADE,
      FOREIGN KEY (base_artifact_id) REFERENCES base_artifacts(id) ON DELETE SET NULL
    );

    CREATE INDEX idx_game_accounts_user ON game_accounts(user_id);
    CREATE INDEX idx_account_heroes_account ON account_heroes(account_id);
    CREATE INDEX idx_account_heroes_class ON account_heroes(class);
    CREATE INDEX idx_account_heroes_element ON account_heroes(element);
    CREATE INDEX idx_account_artifacts_account ON account_artifacts(account_id);
    CREATE INDEX idx_account_artifacts_class ON account_artifacts(class);
  `);
}

export function getDb(): Database.Database {
  return new Database(SQLITE_DB_PATH);
}
