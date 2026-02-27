import Database from 'better-sqlite3';

import {
  HERO_CLASSES,
  ARTIFACT_CLASSES,
  ELEMENTS,
  HERO_RATINGS,
  ARTIFACT_GAUGE_MAX,
} from '../config.js';

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

function isValidHeroRating(rating: string): boolean {
  return heroRatings.includes(rating);
}

function isValidArtifactGaugeLevel(level: number): boolean {
  return Number.isInteger(level) && level >= 0 && level <= ARTIFACT_GAUGE_MAX;
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
  const transaction = db.transaction(() => {
    const exists = db
      .prepare('SELECT id FROM game_accounts WHERE id = ? AND user_id = ?')
      .get(accountId, userId);
    if (!exists) {
      throw new Error('Account not found or does not belong to user');
    }
    db.prepare('UPDATE game_accounts SET is_active = 0 WHERE user_id = ?').run(
      userId,
    );
    const r = db
      .prepare(
        'UPDATE game_accounts SET is_active = 1 WHERE id = ? AND user_id = ?',
      )
      .run(accountId, userId);
    if (r.changes === 0) {
      throw new Error('Failed to set active account');
    }
  });
  transaction();
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
  const r = db
    .prepare('DELETE FROM game_accounts WHERE id = ? AND user_id = ?')
    .run(accountId, userId);
  return r.changes > 0;
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

/** Idempotent: seeds account_heroes from base_heroes only for rows that don't already exist for this account. Safe to call multiple times. */
export function seedAccountHeroesFromBase(
  db: Database.Database,
  accountId: number,
): void {
  db.prepare(
    `
    INSERT INTO account_heroes (account_id, base_hero_id, name, class, element, star_rating, rating, display_order)
    SELECT ?, id, name, class, element, star_rating, '-', display_order FROM base_heroes bh
    WHERE NOT EXISTS (SELECT 1 FROM account_heroes ah WHERE ah.account_id = ? AND ah.base_hero_id = bh.id)
  `,
  ).run(accountId, accountId);
}

/** Idempotent: seeds account_artifacts from base_artifacts only for rows that don't already exist for this account. Safe to call multiple times. */
export function seedAccountArtifactsFromBase(
  db: Database.Database,
  accountId: number,
): void {
  db.prepare(
    `
    INSERT INTO account_artifacts (account_id, base_artifact_id, name, class, star_rating, gauge_level, display_order)
    SELECT ?, id, name, class, star_rating, 0, display_order FROM base_artifacts ba
    WHERE NOT EXISTS (SELECT 1 FROM account_artifacts aa WHERE aa.account_id = ? AND aa.base_artifact_id = ba.id)
  `,
  ).run(accountId, accountId);
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
  if (!isValidHeroRating(rating)) {
    return false;
  }
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
  if (!isValidArtifactGaugeLevel(gaugeLevel)) {
    return false;
  }
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
  const r = db
    .prepare(
      `INSERT INTO account_heroes (account_id, base_hero_id, name, class, element, star_rating, rating, display_order)
       VALUES (?, ?, ?, ?, ?, ?, '-', (SELECT COALESCE(MAX(display_order), -1) + 1 FROM account_heroes WHERE account_id = ?))`,
    )
    .run(accountId, baseHeroId, name, cls, element, starRating, accountId);
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
  const r = db
    .prepare(
      `INSERT INTO account_artifacts (account_id, base_artifact_id, name, class, star_rating, gauge_level, display_order)
       VALUES (?, ?, ?, ?, ?, 0, (SELECT COALESCE(MAX(display_order), -1) + 1 FROM account_artifacts WHERE account_id = ?))`,
    )
    .run(accountId, baseArtifactId, name, cls, starRating, accountId);
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
  const r = db
    .prepare(
      `INSERT INTO base_heroes (name, class, element, star_rating, display_order)
       VALUES (?, ?, ?, ?, (SELECT COALESCE(MAX(display_order), -1) + 1 FROM base_heroes))`,
    )
    .run(name, cls, element, starRating);
  return Number(r.lastInsertRowid);
}

export function addBaseArtifact(
  db: Database.Database,
  name: string,
  cls: string,
  starRating: number,
): number {
  const r = db
    .prepare(
      `INSERT INTO base_artifacts (name, class, star_rating, display_order)
       VALUES (?, ?, ?, (SELECT COALESCE(MAX(display_order), -1) + 1 FROM base_artifacts))`,
    )
    .run(name, cls, starRating);
  return Number(r.lastInsertRowid);
}

export function deleteBaseHero(db: Database.Database, heroId: number): boolean {
  const transaction = db.transaction((id: number) => {
    db.prepare('DELETE FROM account_heroes WHERE base_hero_id = ?').run(id);
    const result = db.prepare('DELETE FROM base_heroes WHERE id = ?').run(id);
    return result.changes > 0;
  });
  return transaction(heroId);
}

export function deleteBaseArtifact(
  db: Database.Database,
  artifactId: number,
): boolean {
  const transaction = db.transaction((id: number) => {
    db.prepare('DELETE FROM account_artifacts WHERE base_artifact_id = ?').run(
      id,
    );
    const result = db.prepare('DELETE FROM base_artifacts WHERE id = ?').run(id);
    return result.changes > 0;
  });
  return transaction(artifactId);
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
  db.prepare(
    `
    INSERT INTO account_heroes (account_id, base_hero_id, name, class, element, star_rating, rating, display_order)
    SELECT id, ?, ?, ?, ?, ?, ?, ? FROM game_accounts
  `,
  ).run(baseHeroId, name, cls, element, starRating, '-', displayOrder);
}

export function addBaseArtifactToAllAccounts(
  db: Database.Database,
  baseArtifactId: number,
  name: string,
  cls: string,
  starRating: number,
  displayOrder: number,
): void {
  db.prepare(
    `
    INSERT INTO account_artifacts (account_id, base_artifact_id, name, class, star_rating, gauge_level, display_order)
    SELECT id, ?, ?, ?, ?, 0, ? FROM game_accounts
  `,
  ).run(baseArtifactId, name, cls, starRating, displayOrder);
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
