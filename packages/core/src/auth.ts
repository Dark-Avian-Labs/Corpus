import argon2 from 'argon2';
import type { SessionData } from 'express-session';
import fs from 'fs';
import path from 'path';

import {
  AUTH_LOCKOUT_FILE,
  AUTH_MAX_ATTEMPTS,
  AUTH_LOCKOUT_MINUTES,
  AUTH_ATTEMPT_WINDOW_SECONDS,
} from './config.js';
import * as q from './db/queries.js';
import { getCentralDb } from './db/schema.js';

export interface CustomSessionData extends SessionData {
  user_id?: number;
  is_admin?: boolean;
}

export type AuthSession = CustomSessionData | undefined;

interface LockoutRecord {
  attempts: number;
  first_attempt: number;
  last_attempt?: number;
  locked_until?: number;
}

type LockoutData = Record<string, LockoutRecord>;

let lockoutCache: LockoutData | null = null;
let lockoutCacheDirty = false;
let lockoutCacheLastLoad = 0;
const LOCKOUT_CACHE_TTL = 5000;
const LOCKOUT_DEBOUNCE_MS = 100;
let lockoutWriteTimer: ReturnType<typeof setTimeout> | null = null;

async function hashPassword(password: string): Promise<string> {
  return await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19 * 1024,
    timeCost: 2,
    parallelism: 1,
  });
}

async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

function ensureLockoutDir(): void {
  const dir = path.dirname(AUTH_LOCKOUT_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function getLockoutData(): LockoutData {
  const now = Date.now();
  const stale =
    lockoutCache === null ||
    (!lockoutCacheDirty && now - lockoutCacheLastLoad > LOCKOUT_CACHE_TTL);
  if (stale && !lockoutCacheDirty) {
    if (!fs.existsSync(AUTH_LOCKOUT_FILE)) {
      lockoutCache = {};
      lockoutCacheLastLoad = now;
      return lockoutCache ?? {};
    }
    try {
      const data = fs.readFileSync(AUTH_LOCKOUT_FILE, 'utf-8');
      lockoutCache = JSON.parse(data) as LockoutData;
      lockoutCacheLastLoad = now;
    } catch {
      lockoutCache = {};
    }
  }
  return lockoutCache ?? {};
}

function flushLockoutToDisk(): void {
  lockoutWriteTimer = null;
  if (!lockoutCacheDirty) return;
  ensureLockoutDir();
  try {
    fs.writeFileSync(AUTH_LOCKOUT_FILE, JSON.stringify(lockoutCache, null, 0));
    lockoutCacheDirty = false;
  } catch (err) {
    console.error('Lockout persist error:', err);
  }
}

function saveLockoutData(data: LockoutData): void {
  lockoutCache = data;
  lockoutCacheDirty = true;
  lockoutCacheLastLoad = Date.now();
  if (lockoutWriteTimer !== null) clearTimeout(lockoutWriteTimer);
  lockoutWriteTimer = setTimeout(flushLockoutToDisk, LOCKOUT_DEBOUNCE_MS);
}

let dummyHashPromise: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  if (!dummyHashPromise) {
    dummyHashPromise = argon2.hash('timing-dummy', {
      type: argon2.argon2id,
      memoryCost: 19 * 1024,
      timeCost: 2,
      parallelism: 1,
    });
  }
  return dummyHashPromise;
}

export function getClientIP(req: {
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
}): string {
  const trustProxy =
    process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY === 'true';
  if (!trustProxy) {
    return req.ip ?? 'unknown';
  }
  const forwarded = req.headers?.['x-forwarded-for'];
  if (forwarded) {
    const first = Array.isArray(forwarded)
      ? forwarded[0]
      : String(forwarded).split(',')[0];
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
  return Math.max(0, Math.floor(until - Date.now() / 1000));
}

function recordFailedAttempt(ip: string): number {
  const data = getLockoutData();
  const nowSec = Math.floor(Date.now() / 1000);
  if (!data[ip]) {
    data[ip] = { attempts: 0, first_attempt: nowSec };
  }
  if (nowSec - data[ip].first_attempt > AUTH_ATTEMPT_WINDOW_SECONDS) {
    data[ip].attempts = 0;
    data[ip].first_attempt = nowSec;
  }
  data[ip].attempts++;
  data[ip].last_attempt = nowSec;
  if (data[ip].attempts >= AUTH_MAX_ATTEMPTS) {
    data[ip].locked_until = nowSec + AUTH_LOCKOUT_MINUTES * 60;
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

export async function attemptLogin(
  username: string,
  password: string,
  ip: string,
): Promise<
  | { success: true; user: { id: number; username: string; is_admin: number } }
  | { success: false; error: string }
> {
  if (isLockedOut(ip)) {
    return {
      success: false,
      error: 'Too many failed attempts. Try again later.',
    };
  }
  const db = getCentralDb();
  const user = q.getUserByUsername(db, username);
  if (!user) {
    const h = await getDummyHash();
    await verifyPassword(password, h);
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
  const ok = await verifyPassword(password, user.password_hash);
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
  return {
    success: true,
    user: {
      id: user.id,
      username: user.username,
      is_admin: user.is_admin,
    },
  };
}

export async function createUser(
  username: string,
  password: string,
  isAdminUser: boolean,
): Promise<
  { success: true; user_id: number } | { success: false; error: string }
> {
  const u = username.trim();
  if (!password) {
    return { success: false, error: 'Password is required' };
  }
  if (!u) {
    return { success: false, error: 'Username is required' };
  }
  if (u.length < 3) {
    return { success: false, error: 'Username must be at least 3 characters' };
  }
  if (u.length > 30) {
    return { success: false, error: 'Username must be at most 30 characters' };
  }
  if (!/^[a-zA-Z0-9_]+$/.test(u)) {
    return {
      success: false,
      error: 'Username may only contain letters, numbers, and underscores',
    };
  }
  if (password.length < 8) {
    return {
      success: false,
      error: 'Password must be at least 8 characters',
    };
  }
  const db = getCentralDb();
  const hash = await hashPassword(password);
  const result = q.createUser(db, u, hash, isAdminUser);
  if (!result.inserted) {
    return { success: false, error: 'Username already exists' };
  }
  return { success: true, user_id: result.id };
}

export function deleteUser(
  currentUserId: number,
  targetUserId: number,
): { success: true } | { success: false; error: string } {
  if (targetUserId === currentUserId) {
    return { success: false, error: 'Cannot delete your own account' };
  }
  const db = getCentralDb();
  if (!q.deleteUser(db, targetUserId)) {
    return { success: false, error: 'User not found' };
  }
  return { success: true };
}

export async function changePassword(
  userId: number,
  newPassword: string,
): Promise<{ success: true } | { success: false; error: string }> {
  if (newPassword.length < 8) {
    return { success: false, error: 'Password must be at least 8 characters' };
  }
  const db = getCentralDb();
  const hash = await hashPassword(newPassword);
  if (!q.updateUserPassword(db, userId, hash)) {
    return { success: false, error: 'User not found' };
  }
  return { success: true };
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

export function setUserGameAccess(
  userId: number,
  gameId: string,
  enabled: boolean,
): boolean {
  const db = getCentralDb();
  return q.setUserGameAccess(db, userId, gameId, enabled);
}

export function isAuthenticated(session: AuthSession): boolean {
  return typeof session?.user_id === 'number' && session.user_id > 0;
}

export function isAdmin(session: AuthSession): boolean {
  return Boolean(session?.is_admin);
}
