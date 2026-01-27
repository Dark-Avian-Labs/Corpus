import Database from 'better-sqlite3';

import {
  HERO_CLASSES,
  ARTIFACT_CLASSES,
  ELEMENTS,
  HERO_RATINGS,
  ARTIFACT_GAUGE_MAX,
} from '../config.js';

export interface User {
  id: number;
  username: string;
  password_hash: string;
  is_admin: number;
  created_at: string;
}

export interface GameAccount {
  id: number;
  account_name: string;
  is_active: number;
  created_at?: string;
}

export interface Hero {
  id: number;
  name: string;
  class: string;
  element: string;
  star_rating: number;
  rating: string;
  display_order?: number;
}

export interface Artifact {
  id: number;
  name: string;
  class: string;
  star_rating: number;
  gauge_level: number;
  display_order?: number;
}

export interface BaseHero {
  id: number;
  name: string;
  class: string;
  element: string;
  star_rating: number;
  display_order?: number;
}

export interface BaseArtifact {
  id: number;
  name: string;
  class: string;
  star_rating: number;
  display_order?: number;
}

const heroClasses = HERO_CLASSES as readonly string[];
const artifactClasses = ARTIFACT_CLASSES as readonly string[];
const elements = ELEMENTS as readonly string[];
const heroRatings = HERO_RATINGS as readonly string[];

export function getUserByUsername(
  db: Database.Database,
  username: string,
): User | undefined {
  const row = db
    .prepare(
      'SELECT id, username, password_hash, is_admin, created_at FROM users WHERE username = ?',
    )
    .get(username) as User | undefined;
  return row;
}

export function getGameAccountsByUserId(
  db: Database.Database,
  userId: number,
): GameAccount[] {
  return db
    .prepare(
      'SELECT id, account_name, is_active, created_at FROM game_accounts WHERE user_id = ? ORDER BY is_active DESC, id ASC',
    )
    .all(userId) as GameAccount[];
}

export function getGameAccountByIdAndUser(
  db: Database.Database,
  accountId: number,
  userId: number,
): { id: number; account_name: string } | undefined {
  return db
    .prepare(
      'SELECT id, account_name FROM game_accounts WHERE id = ? AND user_id = ?',
    )
    .get(accountId, userId) as { id: number; account_name: string } | undefined;
}

export function setActiveAccount(
  db: Database.Database,
  userId: number,
  accountId: number,
): void {
  db.prepare('UPDATE game_accounts SET is_active = 0 WHERE user_id = ?').run(
    userId,
  );
  db.prepare('UPDATE game_accounts SET is_active = 1 WHERE id = ?').run(
    accountId,
  );
}

export function createGameAccount(
  db: Database.Database,
  userId: number,
  accountName: string,
  isFirst: boolean,
): number {
  const r = db
    .prepare(
      'INSERT INTO game_accounts (user_id, account_name, is_active) VALUES (?, ?, ?)',
    )
    .run(userId, accountName, isFirst ? 1 : 0);
  return Number(r.lastInsertRowid);
}

export function getAccountByNameAndUser(
  db: Database.Database,
  userId: number,
  name: string,
): { id: number } | undefined {
  return db
    .prepare(
      'SELECT id FROM game_accounts WHERE user_id = ? AND account_name = ?',
    )
    .get(userId, name) as { id: number } | undefined;
}

export function deleteGameAccount(
  db: Database.Database,
  accountId: number,
  userId: number,
): boolean {
  const exists = db
    .prepare('SELECT id FROM game_accounts WHERE id = ? AND user_id = ?')
    .get(accountId, userId);
  if (!exists) return false;
  db.prepare('DELETE FROM game_accounts WHERE id = ?').run(accountId);
  return true;
}

export function createUser(
  db: Database.Database,
  username: string,
  passwordHash: string,
  isAdmin: boolean,
): number {
  const r = db
    .prepare(
      'INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, ?)',
    )
    .run(username, passwordHash, isAdmin ? 1 : 0);
  return Number(r.lastInsertRowid);
}

export function getUserById(
  db: Database.Database,
  userId: number,
): User | undefined {
  return db
    .prepare(
      'SELECT id, username, password_hash, is_admin, created_at FROM users WHERE id = ?',
    )
    .get(userId) as User | undefined;
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
  account_count: number;
}[] {
  return db
    .prepare(
      `
    SELECT u.id, u.username, u.is_admin, u.created_at, COUNT(ga.id) as account_count
    FROM users u
    LEFT JOIN game_accounts ga ON u.id = ga.user_id
    GROUP BY u.id
    ORDER BY u.created_at ASC
  `,
    )
    .all() as {
    id: number;
    username: string;
    is_admin: number;
    created_at: string;
    account_count: number;
  }[];
}

export function userExists(db: Database.Database, username: string): boolean {
  const row = db
    .prepare('SELECT id FROM users WHERE username = ?')
    .get(username);
  return !!row;
}

export function getUserAccountsForApi(
  db: Database.Database,
  userId: number,
): {
  id: number;
  account_name: string;
  is_active: number;
  created_at: string;
}[] {
  return db
    .prepare(
      'SELECT id, account_name, is_active, created_at FROM game_accounts WHERE user_id = ? ORDER BY created_at ASC',
    )
    .all(userId) as {
    id: number;
    account_name: string;
    is_active: number;
    created_at: string;
  }[];
}

export function seedAccountHeroesFromBase(
  db: Database.Database,
  accountId: number,
): void {
  db.prepare(
    `
    INSERT INTO account_heroes (account_id, base_hero_id, name, class, element, star_rating, rating, display_order)
    SELECT ?, id, name, class, element, star_rating, '-', display_order FROM base_heroes
  `,
  ).run(accountId);
}

export function seedAccountArtifactsFromBase(
  db: Database.Database,
  accountId: number,
): void {
  db.prepare(
    `
    INSERT INTO account_artifacts (account_id, base_artifact_id, name, class, star_rating, gauge_level, display_order)
    SELECT ?, id, name, class, star_rating, 0, display_order FROM base_artifacts
  `,
  ).run(accountId);
}

export function getHeroes(
  db: Database.Database,
  accountId: number,
  classFilter: string,
  elementFilter: string,
): Hero[] {
  let sql =
    'SELECT id, name, class, element, star_rating, rating, display_order FROM account_heroes WHERE account_id = ?';
  const params: (number | string)[] = [accountId];
  if (classFilter && heroClasses.includes(classFilter)) {
    sql += ' AND class = ?';
    params.push(classFilter);
  }
  if (elementFilter && elements.includes(elementFilter)) {
    sql += ' AND element = ?';
    params.push(elementFilter);
  }
  sql += ' ORDER BY display_order ASC';
  return db.prepare(sql).all(...params) as Hero[];
}

export function getHeroStats(
  db: Database.Database,
  accountId: number,
): { total: number; owned: number; maxed: number } {
  const row = db
    .prepare(
      `
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN rating != '-' THEN 1 ELSE 0 END) as owned,
      SUM(CASE WHEN rating = 'SSS' THEN 1 ELSE 0 END) as maxed
    FROM account_heroes WHERE account_id = ?
  `,
    )
    .get(accountId) as { total: number; owned: number; maxed: number };
  return {
    total: Number(row.total),
    owned: Number(row.owned ?? 0),
    maxed: Number(row.maxed ?? 0),
  };
}

export function getArtifacts(
  db: Database.Database,
  accountId: number,
  classFilter: string,
): Artifact[] {
  let sql =
    'SELECT id, name, class, star_rating, gauge_level, display_order FROM account_artifacts WHERE account_id = ?';
  const params: (number | string)[] = [accountId];
  if (classFilter && artifactClasses.includes(classFilter)) {
    sql += ' AND class = ?';
    params.push(classFilter);
  }
  sql += ' ORDER BY display_order ASC';
  return db.prepare(sql).all(...params) as Artifact[];
}

export function getArtifactStats(
  db: Database.Database,
  accountId: number,
): { total: number; owned: number; maxed: number } {
  const row = db
    .prepare(
      `
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN gauge_level > 0 THEN 1 ELSE 0 END) as owned,
      SUM(CASE WHEN gauge_level = ? THEN 1 ELSE 0 END) as maxed
    FROM account_artifacts WHERE account_id = ?
  `,
    )
    .get(ARTIFACT_GAUGE_MAX, accountId) as {
    total: number;
    owned: number;
    maxed: number;
  };
  return {
    total: Number(row.total),
    owned: Number(row.owned ?? 0),
    maxed: Number(row.maxed ?? 0),
  };
}

export function getBaseHeroes(db: Database.Database): BaseHero[] {
  return db
    .prepare(
      'SELECT id, name, class, element, star_rating, display_order FROM base_heroes ORDER BY name ASC',
    )
    .all() as BaseHero[];
}

export function getBaseArtifacts(db: Database.Database): BaseArtifact[] {
  return db
    .prepare(
      'SELECT id, name, class, star_rating, display_order FROM base_artifacts ORDER BY name ASC',
    )
    .all() as BaseArtifact[];
}

export function updateHeroRating(
  db: Database.Database,
  heroId: number,
  accountId: number,
  rating: string,
): boolean {
  const r = db
    .prepare(
      'UPDATE account_heroes SET rating = ? WHERE id = ? AND account_id = ?',
    )
    .run(rating, heroId, accountId);
  return r.changes > 0;
}

export function updateArtifactGauge(
  db: Database.Database,
  artifactId: number,
  accountId: number,
  gaugeLevel: number,
): boolean {
  const r = db
    .prepare(
      'UPDATE account_artifacts SET gauge_level = ? WHERE id = ? AND account_id = ?',
    )
    .run(gaugeLevel, artifactId, accountId);
  return r.changes > 0;
}

export function addHero(
  db: Database.Database,
  accountId: number,
  name: string,
  cls: string,
  element: string,
  starRating: number,
  baseHeroId: number | null,
): number {
  const maxOrder = db
    .prepare(
      'SELECT MAX(display_order) as m FROM account_heroes WHERE account_id = ?',
    )
    .get(accountId) as { m: number | null };
  const order = (maxOrder?.m ?? -1) + 1;
  const r = db
    .prepare(
      'INSERT INTO account_heroes (account_id, base_hero_id, name, class, element, star_rating, rating, display_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run(accountId, baseHeroId, name, cls, element, starRating, '-', order);
  return Number(r.lastInsertRowid);
}

export function addArtifact(
  db: Database.Database,
  accountId: number,
  name: string,
  cls: string,
  starRating: number,
  baseArtifactId: number | null,
): number {
  const maxOrder = db
    .prepare(
      'SELECT MAX(display_order) as m FROM account_artifacts WHERE account_id = ?',
    )
    .get(accountId) as { m: number | null };
  const order = (maxOrder?.m ?? -1) + 1;
  const r = db
    .prepare(
      'INSERT INTO account_artifacts (account_id, base_artifact_id, name, class, star_rating, gauge_level, display_order) VALUES (?, ?, ?, ?, ?, 0, ?)',
    )
    .run(accountId, baseArtifactId, name, cls, starRating, order);
  return Number(r.lastInsertRowid);
}

export function deleteHero(
  db: Database.Database,
  heroId: number,
  accountId: number,
): boolean {
  const r = db
    .prepare('DELETE FROM account_heroes WHERE id = ? AND account_id = ?')
    .run(heroId, accountId);
  return r.changes > 0;
}

export function deleteArtifact(
  db: Database.Database,
  artifactId: number,
  accountId: number,
): boolean {
  const r = db
    .prepare('DELETE FROM account_artifacts WHERE id = ? AND account_id = ?')
    .run(artifactId, accountId);
  return r.changes > 0;
}

export function updateHeroDetails(
  db: Database.Database,
  heroId: number,
  accountId: number,
  name: string,
  cls: string,
  element: string,
  starRating: number,
): boolean {
  const r = db
    .prepare(
      'UPDATE account_heroes SET name = ?, class = ?, element = ?, star_rating = ? WHERE id = ? AND account_id = ?',
    )
    .run(name, cls, element, starRating, heroId, accountId);
  return r.changes > 0;
}

export function updateArtifactDetails(
  db: Database.Database,
  artifactId: number,
  accountId: number,
  name: string,
  cls: string,
  starRating: number,
): boolean {
  const r = db
    .prepare(
      'UPDATE account_artifacts SET name = ?, class = ?, star_rating = ? WHERE id = ? AND account_id = ?',
    )
    .run(name, cls, starRating, artifactId, accountId);
  return r.changes > 0;
}

export function addBaseHero(
  db: Database.Database,
  name: string,
  cls: string,
  element: string,
  starRating: number,
): number {
  const maxOrder = db
    .prepare('SELECT MAX(display_order) as m FROM base_heroes')
    .get() as { m: number | null };
  const order = (maxOrder?.m ?? -1) + 1;
  const r = db
    .prepare(
      'INSERT INTO base_heroes (name, class, element, star_rating, display_order) VALUES (?, ?, ?, ?, ?)',
    )
    .run(name, cls, element, starRating, order);
  return Number(r.lastInsertRowid);
}

export function addBaseArtifact(
  db: Database.Database,
  name: string,
  cls: string,
  starRating: number,
): number {
  const maxOrder = db
    .prepare('SELECT MAX(display_order) as m FROM base_artifacts')
    .get() as { m: number | null };
  const order = (maxOrder?.m ?? -1) + 1;
  const r = db
    .prepare(
      'INSERT INTO base_artifacts (name, class, star_rating, display_order) VALUES (?, ?, ?, ?)',
    )
    .run(name, cls, starRating, order);
  return Number(r.lastInsertRowid);
}

export function deleteBaseHero(db: Database.Database, heroId: number): void {
  db.prepare('DELETE FROM account_heroes WHERE base_hero_id = ?').run(heroId);
  db.prepare('DELETE FROM base_heroes WHERE id = ?').run(heroId);
}

export function deleteBaseArtifact(
  db: Database.Database,
  artifactId: number,
): void {
  db.prepare('DELETE FROM account_artifacts WHERE base_artifact_id = ?').run(
    artifactId,
  );
  db.prepare('DELETE FROM base_artifacts WHERE id = ?').run(artifactId);
}

export function addBaseHeroToAllAccounts(
  db: Database.Database,
  baseHeroId: number,
  name: string,
  cls: string,
  element: string,
  starRating: number,
  displayOrder: number,
): void {
  const accounts = db.prepare('SELECT id FROM game_accounts').all() as {
    id: number;
  }[];
  const ins = db.prepare(
    'INSERT INTO account_heroes (account_id, base_hero_id, name, class, element, star_rating, rating, display_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  );
  for (const a of accounts) {
    ins.run(
      a.id,
      baseHeroId,
      name,
      cls,
      element,
      starRating,
      '-',
      displayOrder,
    );
  }
}

export function addBaseArtifactToAllAccounts(
  db: Database.Database,
  baseArtifactId: number,
  name: string,
  cls: string,
  starRating: number,
  displayOrder: number,
): void {
  const accounts = db.prepare('SELECT id FROM game_accounts').all() as {
    id: number;
  }[];
  const ins = db.prepare(
    'INSERT INTO account_artifacts (account_id, base_artifact_id, name, class, star_rating, gauge_level, display_order) VALUES (?, ?, ?, ?, ?, 0, ?)',
  );
  for (const a of accounts) {
    ins.run(a.id, baseArtifactId, name, cls, starRating, displayOrder);
  }
}

export function getBaseHeroMaxOrder(db: Database.Database): number {
  const row = db
    .prepare('SELECT MAX(display_order) as m FROM base_heroes')
    .get() as { m: number | null };
  return (row?.m ?? -1) + 1;
}

export function getBaseArtifactMaxOrder(db: Database.Database): number {
  const row = db
    .prepare('SELECT MAX(display_order) as m FROM base_artifacts')
    .get() as { m: number | null };
  return (row?.m ?? -1) + 1;
}

export {
  heroClasses,
  artifactClasses,
  elements,
  heroRatings,
  ARTIFACT_GAUGE_MAX,
};
