import Database from 'better-sqlite3';

import { EPIC7_DB_PATH } from '../config.js';

/** Destructive: drops and recreates Epic Seven tables. Enable foreign keys before use. */
export function createSchema(db: Database.Database): void {
  db.pragma('foreign_keys = ON');
  db.exec(`
    DROP TABLE IF EXISTS account_artifacts;
    DROP TABLE IF EXISTS account_heroes;
    DROP TABLE IF EXISTS game_accounts;
    DROP TABLE IF EXISTS base_artifacts;
    DROP TABLE IF EXISTS base_heroes;

    CREATE TABLE game_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      account_name TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, account_name)
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

function hasTable(db: Database.Database, name: string): boolean {
  const row = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?")
    .get(name);
  return !!row;
}

export type UniqueIndexOutcome =
  | 'created'
  | 'blocked_by_duplicates'
  | 'skipped';

export type UniqueIndexStatus = {
  idx_base_heroes_name_unique: UniqueIndexOutcome;
  idx_base_artifacts_name_unique: UniqueIndexOutcome;
};

function ensureUniqueBaseNameIndexes(db: Database.Database): UniqueIndexStatus {
  const status: UniqueIndexStatus = {
    idx_base_heroes_name_unique: 'skipped',
    idx_base_artifacts_name_unique: 'skipped',
  };
  const heroTableExists = hasTable(db, 'base_heroes');
  if (heroTableExists) {
    status.idx_base_heroes_name_unique = 'created';
    const heroDup = db
      .prepare(
        'SELECT name FROM base_heroes GROUP BY name HAVING COUNT(*) > 1 LIMIT 1',
      )
      .get() as { name: string } | undefined;
    if (heroDup) {
      status.idx_base_heroes_name_unique = 'blocked_by_duplicates';
      console.warn(
        `[epic7 schema] Skipping unique index idx_base_heroes_name_unique: duplicate name in base_heroes: ${JSON.stringify(heroDup.name)}`,
      );
    } else {
      db.exec(
        'CREATE UNIQUE INDEX IF NOT EXISTS idx_base_heroes_name_unique ON base_heroes(name)',
      );
    }
  }
  const artifactTableExists = hasTable(db, 'base_artifacts');
  if (artifactTableExists) {
    status.idx_base_artifacts_name_unique = 'created';
    const artifactDup = db
      .prepare(
        'SELECT name FROM base_artifacts GROUP BY name HAVING COUNT(*) > 1 LIMIT 1',
      )
      .get() as { name: string } | undefined;
    if (artifactDup) {
      status.idx_base_artifacts_name_unique = 'blocked_by_duplicates';
      console.warn(
        `[epic7 schema] Skipping unique index idx_base_artifacts_name_unique: duplicate name in base_artifacts: ${JSON.stringify(artifactDup.name)}`,
      );
    } else {
      db.exec(
        'CREATE UNIQUE INDEX IF NOT EXISTS idx_base_artifacts_name_unique ON base_artifacts(name)',
      );
    }
  }
  return status;
}

let dbInstance: Database.Database | null = null;

export function getDb(): Database.Database {
  if (dbInstance) return dbInstance;
  const instance = new Database(EPIC7_DB_PATH);
  const originalClose = instance.close.bind(instance);
  instance.close = (() => {
    return function closeWithReset(...args: Parameters<typeof originalClose>) {
      const result = originalClose(...args);
      dbInstance = null;
      return result;
    };
  })() as typeof instance.close;
  instance.pragma('foreign_keys = ON');
  instance.pragma('journal_mode = WAL');
  ensureUniqueBaseNameIndexes(instance);
  dbInstance = instance;
  return instance;
}

export function closeDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
