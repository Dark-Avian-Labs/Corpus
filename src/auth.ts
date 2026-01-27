import bcrypt from 'bcrypt';
import fs from 'fs';
import path from 'path';

import {
  AUTH_LOCKOUT_FILE,
  AUTH_MAX_ATTEMPTS,
  AUTH_LOCKOUT_MINUTES,
} from './config.js';
import * as q from './db/queries.js';
import { getDb } from './db/schema.js';

interface LockoutRecord {
  attempts: number;
  first_attempt: number;
  last_attempt?: number;
  locked_until?: number;
}

type LockoutData = Record<string, LockoutRecord>;

function ensureLockoutDir(): void {
  const dir = path.dirname(AUTH_LOCKOUT_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function getLockoutData(): LockoutData {
  if (!fs.existsSync(AUTH_LOCKOUT_FILE)) return {};
  try {
    const data = fs.readFileSync(AUTH_LOCKOUT_FILE, 'utf-8');
    return JSON.parse(data) as LockoutData;
  } catch {
    return {};
  }
}

function saveLockoutData(data: LockoutData): void {
  ensureLockoutDir();
  fs.writeFileSync(AUTH_LOCKOUT_FILE, JSON.stringify(data, null, 0));
}

export function getClientIP(req: {
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
}): string {
  const forwarded = req.headers?.['x-forwarded-for'];
  if (forwarded) {
    const first = Array.isArray(forwarded)
      ? forwarded[0]
      : forwarded.split(',')[0];
    return first?.trim() ?? 'unknown';
  }
  const real = req.headers?.['x-real-ip'];
  if (real) return Array.isArray(real) ? real[0] : real;
  return req.ip ?? 'unknown';
}

export function isLockedOut(ip: string): boolean {
  const data = getLockoutData();
  const record = data[ip];
  if (!record?.locked_until) return false;
  if (Date.now() / 1000 < record.locked_until) return true;
  delete data[ip];
  saveLockoutData(data);
  return false;
}

export function getLockoutRemaining(ip: string): number {
  const data = getLockoutData();
  const until = data[ip]?.locked_until;
  if (!until) return 0;
  const remaining = Math.floor(until - Date.now() / 1000);
  return Math.max(0, remaining);
}

function recordFailedAttempt(ip: string): number {
  const data = getLockoutData();
  if (!data[ip]) {
    data[ip] = { attempts: 0, first_attempt: Math.floor(Date.now() / 1000) };
  }
  data[ip].attempts++;
  data[ip].last_attempt = Math.floor(Date.now() / 1000);
  if (data[ip].attempts >= AUTH_MAX_ATTEMPTS) {
    data[ip].locked_until =
      Math.floor(Date.now() / 1000) + AUTH_LOCKOUT_MINUTES * 60;
  }
  saveLockoutData(data);
  return AUTH_MAX_ATTEMPTS - data[ip].attempts;
}

function clearFailedAttempts(ip: string): void {
  const data = getLockoutData();
  if (data[ip]) {
    delete data[ip];
    saveLockoutData(data);
  }
}

export function attemptLogin(
  username: string,
  password: string,
  ip: string,
): { success: true } | { success: false; error: string } {
  if (isLockedOut(ip)) {
    return {
      success: false,
      error: 'Too many failed attempts. Try again later.',
    };
  }

  const db = getDb();
  try {
    const user = q.getUserByUsername(db, username.trim());
    if (!user) {
      const remaining = recordFailedAttempt(ip);
      if (remaining <= 0) {
        return {
          success: false,
          error: `Too many failed attempts. Locked out for ${AUTH_LOCKOUT_MINUTES} minutes.`,
        };
      }
      return {
        success: false,
        error: `Invalid username or password. ${remaining} attempt(s) remaining.`,
      };
    }

    const ok = bcrypt.compareSync(password, user.password_hash);
    if (!ok) {
      const remaining = recordFailedAttempt(ip);
      if (remaining <= 0) {
        return {
          success: false,
          error: `Too many failed attempts. Locked out for ${AUTH_LOCKOUT_MINUTES} minutes.`,
        };
      }
      return {
        success: false,
        error: `Invalid username or password. ${remaining} attempt(s) remaining.`,
      };
    }

    clearFailedAttempts(ip);
    return { success: true };
  } finally {
    db.close();
  }
}

export function getUserForLogin(
  username: string,
): { id: number; username: string; is_admin: number } | null {
  const db = getDb();
  try {
    const user = q.getUserByUsername(db, username.trim());
    if (!user) return null;
    return { id: user.id, username: user.username, is_admin: user.is_admin };
  } finally {
    db.close();
  }
}

export function getAccountsForUser(
  userId: number,
): { id: number; account_name: string; is_active: number }[] {
  const db = getDb();
  try {
    const rows = q.getGameAccountsByUserId(db, userId);
    return rows.map((r: q.GameAccount) => ({
      id: r.id,
      account_name: r.account_name,
      is_active: r.is_active,
    }));
  } finally {
    db.close();
  }
}

export function switchAccount(
  userId: number,
  accountId: number,
):
  | { success: true; account: { id: number; account_name: string } }
  | { success: false; error: string } {
  const db = getDb();
  try {
    const account = q.getGameAccountByIdAndUser(db, accountId, userId);
    if (!account) return { success: false, error: 'Account not found' };
    q.setActiveAccount(db, userId, accountId);
    return { success: true, account };
  } finally {
    db.close();
  }
}

export function createGameAccount(
  userId: number,
  accountName: string,
): { success: true; account_id: number } | { success: false; error: string } {
  const db = getDb();
  try {
    const name = accountName.trim();
    if (!name) return { success: false, error: 'Account name is required' };
    if (q.getAccountByNameAndUser(db, userId, name)) {
      return { success: false, error: 'Account name already exists' };
    }
    const accounts = q.getGameAccountsByUserId(db, userId);
    const isFirst = accounts.length === 0;
    const accountId = q.createGameAccount(db, userId, name, isFirst);
    q.seedAccountHeroesFromBase(db, accountId);
    q.seedAccountArtifactsFromBase(db, accountId);
    return { success: true, account_id: accountId };
  } finally {
    db.close();
  }
}

export function deleteGameAccount(
  userId: number,
  accountId: number,
): { success: true } | { success: false; error: string } {
  const db = getDb();
  try {
    if (!q.deleteGameAccount(db, accountId, userId)) {
      return { success: false, error: 'Account not found' };
    }
    return { success: true };
  } finally {
    db.close();
  }
}

export function createUser(
  username: string,
  password: string,
  isAdminUser: boolean,
): { success: true; user_id: number } | { success: false; error: string } {
  const db = getDb();
  try {
    const u = username.trim();
    if (!u || !password) {
      return { success: false, error: 'Username and password are required' };
    }
    if (password.length < 4) {
      return {
        success: false,
        error: 'Password must be at least 4 characters',
      };
    }
    if (q.userExists(db, u)) {
      return { success: false, error: 'Username already exists' };
    }
    const hash = bcrypt.hashSync(password, 10);
    const userId = q.createUser(db, u, hash, isAdminUser);
    return { success: true, user_id: userId };
  } finally {
    db.close();
  }
}

export function deleteUser(
  currentUserId: number,
  targetUserId: number,
): { success: true } | { success: false; error: string } {
  if (targetUserId === currentUserId) {
    return { success: false, error: 'Cannot delete your own account' };
  }
  const db = getDb();
  try {
    if (!q.deleteUser(db, targetUserId)) {
      return { success: false, error: 'User not found' };
    }
    return { success: true };
  } finally {
    db.close();
  }
}

export function changePassword(
  userId: number,
  newPassword: string,
): { success: true } | { success: false; error: string } {
  if (newPassword.length < 4) {
    return { success: false, error: 'Password must be at least 4 characters' };
  }
  const db = getDb();
  try {
    const hash = bcrypt.hashSync(newPassword, 10);
    if (!q.updateUserPassword(db, userId, hash)) {
      return { success: false, error: 'User not found' };
    }
    return { success: true };
  } finally {
    db.close();
  }
}

export function getAllUsers(): {
  id: number;
  username: string;
  is_admin: number;
  created_at: string;
  account_count: number;
}[] {
  const db = getDb();
  try {
    return q.getAllUsers(db);
  } finally {
    db.close();
  }
}

export function getUserAccounts(userId: number): {
  id: number;
  account_name: string;
  is_active: number;
  created_at: string;
}[] {
  const db = getDb();
  try {
    return q.getUserAccountsForApi(db, userId);
  } finally {
    db.close();
  }
}

export function isAuthenticated(
  session: { user_id?: number } | undefined,
): boolean {
  return typeof session?.user_id === 'number' && session.user_id > 0;
}

export function isAdmin(session: { is_admin?: boolean } | undefined): boolean {
  return Boolean(session?.is_admin);
}
