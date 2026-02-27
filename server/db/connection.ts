import Database from 'better-sqlite3';

import { CENTRAL_DB_PATH } from '../config.js';

let centralDb: Database.Database | null = null;

export function getCentralDb(): Database.Database {
  if (centralDb) {
    return centralDb;
  }
  centralDb = new Database(CENTRAL_DB_PATH);
  try {
    const result = centralDb.prepare('PRAGMA journal_mode = WAL;').get() as
      | { journal_mode?: string }
      | undefined;
    if (result?.journal_mode?.toLowerCase() !== 'wal') {
      throw new Error(
        `Unexpected journal_mode: ${result?.journal_mode ?? 'unknown'}`,
      );
    }
  } catch (error) {
    console.error('Failed to enable WAL mode for central DB:', error);
    if (centralDb) {
      const dbToClose = centralDb;
      centralDb = null;
      if (typeof dbToClose.close === 'function') {
        dbToClose.close();
      }
    }
    throw error;
  }
  return centralDb;
}

export function closeCentralDb(): void {
  if (!centralDb) {
    return;
  }

  const dbToClose = centralDb;
  centralDb = null;

  try {
    dbToClose.close();
  } catch (error) {
    console.error('Failed to close central DB:', error);
  }
}
