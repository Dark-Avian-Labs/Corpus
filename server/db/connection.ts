import Database from 'better-sqlite3';

import { CENTRAL_DB_PATH } from '../config.js';

let centralDb: Database.Database | null = null;

export function getCentralDb(): Database.Database {
  if (centralDb) {
    return centralDb;
  }
  centralDb = new Database(CENTRAL_DB_PATH);
  return centralDb;
}
