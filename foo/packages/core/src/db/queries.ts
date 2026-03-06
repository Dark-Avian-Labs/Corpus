import Database from 'better-sqlite3';

export interface CentralUser {
  id: number;
  username: string;
  password_hash: string;
  is_admin: number;
  created_at: string;
}

export function getUserByUsername(
  db: Database.Database,
  username: string,
): CentralUser | undefined {
  return db
    .prepare(
      'SELECT id, username, password_hash, is_admin, created_at FROM users WHERE LOWER(username) = LOWER(?)',
    )
    .get(username.trim()) as CentralUser | undefined;
}

export function getUserById(
  db: Database.Database,
  userId: number,
): CentralUser | undefined {
  return db
    .prepare(
      'SELECT id, username, password_hash, is_admin, created_at FROM users WHERE id = ?',
    )
    .get(userId) as CentralUser | undefined;
}

export function createUser(
  db: Database.Database,
  username: string,
  passwordHash: string,
  isAdmin: boolean,
): { id: number; inserted: boolean } {
  const trimmed = username.trim();
  const existing = db
    .prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?)')
    .get(trimmed) as { id: number } | undefined;
  if (existing) return { id: existing.id, inserted: false };
  const r = db
    .prepare(
      'INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, ?)',
    )
    .run(trimmed, passwordHash, isAdmin ? 1 : 0);
  return { id: Number(r.lastInsertRowid), inserted: true };
}

export function deleteUser(db: Database.Database, userId: number): boolean {
  const r = db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  return r.changes > 0;
}

export function updateUserPassword(
  db: Database.Database,
  userId: number,
  passwordHash: string,
): boolean {
  const r = db
    .prepare('UPDATE users SET password_hash = ? WHERE id = ?')
    .run(passwordHash, userId);
  return r.changes > 0;
}

export function getAllUsers(db: Database.Database): {
  id: number;
  username: string;
  is_admin: number;
  created_at: string;
}[] {
  return db
    .prepare(
      'SELECT id, username, is_admin, created_at FROM users ORDER BY created_at ASC',
    )
    .all() as {
    id: number;
    username: string;
    is_admin: number;
    created_at: string;
  }[];
}

export function getGamesForUser(
  db: Database.Database,
  userId: number,
): string[] {
  const rows = db
    .prepare('SELECT game_id FROM user_game_access WHERE user_id = ?')
    .all(userId) as { game_id: string }[];
  return rows.map((r) => r.game_id);
}

export function hasAccess(
  db: Database.Database,
  userId: number,
  gameId: string,
): boolean {
  const row = db
    .prepare('SELECT 1 FROM user_game_access WHERE user_id = ? AND game_id = ?')
    .get(userId, gameId);
  return !!row;
}

export function grantGameAccess(
  db: Database.Database,
  userId: number,
  gameId: string,
): boolean {
  const r = db
    .prepare(
      'INSERT OR IGNORE INTO user_game_access (user_id, game_id) VALUES (?, ?)',
    )
    .run(userId, gameId);
  return r.changes > 0;
}

export function revokeGameAccess(
  db: Database.Database,
  userId: number,
  gameId: string,
): boolean {
  const r = db
    .prepare('DELETE FROM user_game_access WHERE user_id = ? AND game_id = ?')
    .run(userId, gameId);
  return r.changes > 0;
}

export function setUserGameAccess(
  db: Database.Database,
  userId: number,
  gameId: string,
  enabled: boolean,
): boolean {
  if (enabled) {
    return grantGameAccess(db, userId, gameId);
  }
  return revokeGameAccess(db, userId, gameId);
}
