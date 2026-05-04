import type { SessionData } from 'express-session';

import * as q from './db/queries.js';
import { getCentralDb } from './db/schema.js';

export interface CustomSessionData extends SessionData {
  user_id?: number;
  username?: string;
  is_admin?: boolean;
  login_time?: number;
}

export type AuthSession = CustomSessionData | undefined;

export function getGamesForUser(userId: number): string[] {
  const db = getCentralDb();
  return q.getGamesForUser(db, userId);
}

export function hasAccess(userId: number, gameId: string): boolean {
  const db = getCentralDb();
  return q.hasAccess(db, userId, gameId);
}

export function grantGameAccess(userId: number, gameId: string): boolean {
  const db = getCentralDb();
  return q.grantGameAccess(db, userId, gameId);
}

export function setUserGameAccess(userId: number, gameId: string, enabled: boolean): boolean {
  const db = getCentralDb();
  return q.setUserGameAccess(db, userId, gameId, enabled);
}

export function getAllUsers(): {
  id: number;
  username: string;
  is_admin: number;
  created_at: string;
}[] {
  const db = getCentralDb();
  return q.getAllUsers(db);
}

export function isAuthenticated(session: AuthSession): boolean {
  return typeof session?.user_id === 'number' && session.user_id > 0;
}

export function isAdmin(session: AuthSession): boolean {
  return Boolean(session?.is_admin);
}
