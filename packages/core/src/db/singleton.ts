import Database from 'better-sqlite3';

export interface DbSingletonOptions {
  /** Extra pragmas to run on first connection (e.g. `['journal_mode = WAL']`). */
  pragmas?: string[];
  /** Called once after the connection is opened and pragmas are set. */
  onOpen?: (db: Database.Database) => void;
}

export interface DbSingleton {
  getDb(): Database.Database;
  closeDb(): void;
}

/**
 * Creates a lazy-initialised singleton around a SQLite database file.
 *
 * - Opens the database on first `getDb()` call.
 * - Patches `db.close()` so the singleton resets automatically.
 * - Enables `foreign_keys = ON` by default.
 */
export function createDbSingleton(
  dbPath: string,
  options?: DbSingletonOptions,
): DbSingleton {
  let instance: Database.Database | null = null;

  function getDb(): Database.Database {
    if (instance) return instance;
    const db = new Database(dbPath);
    const originalClose = db.close.bind(db);
    db.close = ((...args: Parameters<typeof originalClose>) => {
      const result = originalClose(...args);
      instance = null;
      return result;
    }) as typeof db.close;
    try {
      db.pragma('foreign_keys = ON');
      if (options?.pragmas) {
        for (const p of options.pragmas) {
          db.pragma(p);
        }
      }
      options?.onOpen?.(db);
    } catch (err) {
      db.close();
      throw err;
    }
    instance = db;
    return db;
  }

  function closeDb(): void {
    if (instance) {
      instance.close();
    }
  }

  return { getDb, closeDb };
}
