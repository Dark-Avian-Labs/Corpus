import {
  type GameModule,
  APP_NAME,
  CENTRAL_DB_PATH,
  COOKIE_DOMAIN,
  GAME_HOSTS,
  createCentralSchema,
  getGamesForUser,
  attemptLogin,
  getClientIP,
  isLockedOut,
  getLockoutRemaining,
  createUser,
  deleteUser,
  setUserGameAccess,
  getAllUsers,
  requireAuth,
  requireAdmin,
  redirectIfAuthenticated,
} from '@corpus/core';
import { epic7Game } from '@corpus/game-epic7';
import { warframeGame } from '@corpus/game-warframe';
import Database from 'better-sqlite3';
import cookieParser from 'cookie-parser';
import { randomBytes } from 'crypto';
import { csrfSync } from 'csrf-sync';
import express from 'express';
import session from 'express-session';
import fs from 'fs';
import helmet from 'helmet';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

import { escapeHtml } from './escapeHtml.js';
import {
  generalLimiter,
  loginLimiter,
  adminLimiter,
} from './middleware/rateLimit.js';

const require = createRequire(import.meta.url);
const SQLiteStore = require('better-sqlite3-session-store')(session);

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Descriptor for a game used in UI (id, name, path, optional theme). */
export type GameDescriptor = {
  id: string;
  name: string;
  path: string;
  theme?: { primary?: string };
};

/** Type for index view: game with server-validated safe path for href. */
export type GameWithSafePath = GameDescriptor & { safePath: string };

const GAME_MODULES: GameModule[] = [warframeGame, epic7Game];

/** Central registry of game descriptors; keyed by game id. */
export const GAME_REGISTRY: Record<string, GameDescriptor> = Object.fromEntries(
  GAME_MODULES.map((g) => [
    g.id,
    { id: g.id, name: g.name, path: `/games/${g.id}`, theme: g.theme },
  ]),
);

/**
 * Returns a safe URL for use in href. Allows relative paths (/, ./) and http(s) only.
 * Prevents protocol-based XSS (e.g. javascript:, data:). Invalid values return '#'.
 */
export function sanitizeGamePath(raw: string | null | undefined): string {
  if (raw == null || typeof raw !== 'string') return '#';
  const s = raw.trim();
  if (s === '') return '#';
  if (s.startsWith('/') && !s.startsWith('//')) return s;
  if (s.startsWith('./')) return s;
  const lower = s.toLowerCase();
  if (lower.startsWith('https://') || lower.startsWith('http://')) return s;
  return '#';
}

function gamesForUser(userId: number): GameDescriptor[] {
  return getGamesForUser(userId)
    .map((id) => GAME_REGISTRY[id])
    .filter((d): d is GameDescriptor => d != null);
}

function gamesForUserWithSafePath(userId: number): GameWithSafePath[] {
  return gamesForUser(userId).map((g) => ({
    ...g,
    safePath: sanitizeGamePath(g.path),
  }));
}

const viewsPath = path.join(process.cwd(), 'dist', 'views');
const PORT = parseInt(process.env.PORT ?? '3000', 10);
const HOST = process.env.HOST ?? '127.0.0.1';
const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET || SESSION_SECRET.length < 32) {
  throw new Error(
    'Set SESSION_SECRET to a strong random string (at least 32 characters) in .env',
  );
}
const TRUST_PROXY =
  process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY === 'true';
const SECURE_COOKIES =
  process.env.SECURE_COOKIES === '1' || process.env.SECURE_COOKIES === 'true';

const app = express();
if (TRUST_PROXY) app.set('trust proxy', 1);

app.set('view engine', 'ejs');
app.set('views', viewsPath);

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const centralDir = path.dirname(CENTRAL_DB_PATH);
if (!fs.existsSync(centralDir)) fs.mkdirSync(centralDir, { recursive: true });
const sessionDb = new Database(CENTRAL_DB_PATH);
createCentralSchema(sessionDb);

const sessionStore = new SQLiteStore({
  client: sessionDb,
  expired: { clear: true, intervalMs: 15 * 60 * 1000 },
});

const cookieOptions: express.CookieOptions = {
  maxAge: 7 * 24 * 60 * 60 * 1000,
  httpOnly: true,
  secure: SECURE_COOKIES,
  sameSite: 'lax',
};
if (COOKIE_DOMAIN) cookieOptions.domain = COOKIE_DOMAIN;

app.use(
  session({
    store: sessionStore,
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: cookieOptions,
  }),
);

const { csrfSynchronisedProtection, generateToken } = csrfSync({
  getTokenFromRequest: (req: express.Request) => {
    if (req.body?._csrf) return req.body._csrf as string;
    const q = req.query?._csrf;
    if (Array.isArray(q)) return (q[0] as string) ?? null;
    if (typeof q === 'string') return q;
    const header = req.headers['x-csrf-token'] || req.headers['x-xsrf-token'];
    return (Array.isArray(header) ? header[0] : header) ?? null;
  },
  getTokenFromState: (req) => {
    const s = req.session;
    if (!s) return null;
    return s.csrfToken ?? null;
  },
  storeTokenInState: (req, token) => {
    if (req.session) {
      req.session.csrfToken = token;
    }
  },
});

app.use(csrfSynchronisedProtection);
app.use((_req, res, next) => {
  (res.locals as { cspNonce?: string }).cspNonce =
    randomBytes(16).toString('base64');
  next();
});

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: [
          "'self'",
          (_req, res) =>
            `'nonce-${(res as express.Response).locals.cspNonce ?? ''}'`,
        ],
        imgSrc: ["'self'", 'data:'],
      },
    },
  }),
);

app.use((req, res, next) => {
  (res.locals as { csrfToken?: string }).csrfToken = generateToken(req);
  next();
});

const sharedAssetsDir = fs.existsSync(
  path.join(process.cwd(), 'dist', 'shared'),
)
  ? path.join(process.cwd(), 'dist', 'shared')
  : path.join(process.cwd(), 'packages', 'core', 'assets');
const backgroundPath = path.join(sharedAssetsDir, 'background.txt');
let backgroundArt = '';
if (fs.existsSync(backgroundPath)) {
  try {
    backgroundArt = fs.readFileSync(backgroundPath, 'utf-8');
  } catch {
    // ignore
  }
}
app.use((_req, res, next) => {
  (res.locals as { art?: string }).art = backgroundArt;
  next();
});

function hostToGameRedirect(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
): void {
  const host = req.hostname;
  const gameId = GAME_HOSTS[host];
  if (gameId && (req.path === '/' || req.path === '')) {
    res.redirect(302, `/games/${gameId}`);
    return;
  }
  next();
}

app.use(
  '/static',
  express.static(path.join(process.cwd(), 'dist', 'static'), {
    maxAge: process.env.NODE_ENV === 'production' ? '1y' : 0,
  }),
);
app.use(
  '/shared',
  express.static(
    fs.existsSync(path.join(process.cwd(), 'dist', 'shared'))
      ? path.join(process.cwd(), 'dist', 'shared')
      : path.join(process.cwd(), 'packages', 'core', 'assets'),
    { maxAge: process.env.NODE_ENV === 'production' ? '1y' : 0 },
  ),
);
app.get('/favicon.ico', generalLimiter, (req, res) => {
  const p = path.join(process.cwd(), 'favicon.ico');
  res.sendFile(p, (err) => {
    if (err) res.status(404).end();
  });
});

app.get('/login', generalLimiter, redirectIfAuthenticated, (req, res) => {
  const ip = getClientIP(req);
  const nextUrl =
    typeof req.query?.next === 'string' && req.query.next ? req.query.next : '';
  res.render('login', {
    appName: APP_NAME,
    error: '',
    lockedOut: isLockedOut(ip),
    lockoutRemaining: getLockoutRemaining(ip),
    dbExists: fs.existsSync(CENTRAL_DB_PATH),
    csrfToken: (res.locals as { csrfToken?: string }).csrfToken ?? '',
    next: nextUrl,
    esc: escapeHtml,
  });
});

app.post('/login', loginLimiter, redirectIfAuthenticated, async (req, res) => {
  const ip = getClientIP(req);
  if (isLockedOut(ip)) {
    const nextUrl = typeof req.body?.next === 'string' ? req.body.next : '';
    return res.render('login', {
      appName: APP_NAME,
      error: 'Too many failed attempts. Try again later.',
      lockedOut: true,
      lockoutRemaining: getLockoutRemaining(ip),
      dbExists: fs.existsSync(CENTRAL_DB_PATH),
      csrfToken: (res.locals as { csrfToken?: string }).csrfToken ?? '',
      next: nextUrl,
      esc: escapeHtml,
    });
  }
  const username = String(req.body?.username ?? '').trim();
  const password = String(req.body?.password ?? '');
  const result = await attemptLogin(username, password, ip);
  if (!result.success || !result.user) {
    const nextUrl = typeof req.body?.next === 'string' ? req.body.next : '';
    return res.render('login', {
      appName: APP_NAME,
      error: result.success ? 'Invalid login.' : result.error,
      lockedOut: isLockedOut(ip),
      lockoutRemaining: getLockoutRemaining(ip),
      dbExists: fs.existsSync(CENTRAL_DB_PATH),
      csrfToken: (res.locals as { csrfToken?: string }).csrfToken ?? '',
      next: nextUrl,
      esc: escapeHtml,
    });
  }
  const user = result.user;
  req.session.regenerate((err) => {
    if (err) return res.redirect('/login');
    (
      req.session as { user_id?: number; username?: string; is_admin?: boolean }
    ).user_id = user.id;
    (req.session as { username?: string }).username = user.username;
    (req.session as { is_admin?: boolean }).is_admin = Boolean(user.is_admin);
    req.session.save((saveErr) => {
      if (saveErr) return res.redirect('/login');
      const rawNext = typeof req.body?.next === 'string' ? req.body.next : '';
      const allowedPaths = new Set([
        '/',
        ...Object.keys(GAME_REGISTRY).map((id) => `/games/${id}`),
      ]);
      const nextPathOnly = rawNext.split('?')[0];
      const isRelativePath =
        nextPathOnly.startsWith('/') &&
        !nextPathOnly.startsWith('//') &&
        !nextPathOnly.includes('://');
      const safeNext =
        isRelativePath && allowedPaths.has(nextPathOnly) ? nextPathOnly : '';
      if (safeNext) return res.redirect(safeNext);
      const games = getGamesForUser(user.id);
      if (games.length === 1) return res.redirect(`/games/${games[0]}`);
      res.redirect('/');
    });
  });
});

app.post('/logout', generalLimiter, requireAuth, (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

app.get(
  '/',
  generalLimiter,
  hostToGameRedirect,
  requireAuth,
  (req, res, next) => {
    const csrfToken = (res.locals as { csrfToken?: string }).csrfToken;
    if (typeof csrfToken !== 'string' || csrfToken === '') {
      return next(
        new Error('CSRF token missing: index view requires a valid csrfToken.'),
      );
    }
    const userId = (req.session as { user_id?: number }).user_id!;
    return res.render('index', {
      appName: APP_NAME,
      games: gamesForUserWithSafePath(userId),
      art: (res.locals as { art?: string }).art,
      csrfToken,
    });
  },
);

app.get('/admin', adminLimiter, requireAdmin, (req, res) => {
  const users = getAllUsers();
  const usersWithGames = users.map((u) => ({
    ...u,
    games: getGamesForUser(u.id),
  }));
  const currentUserId = (req.session as { user_id?: number }).user_id;
  res.render('admin', {
    appName: APP_NAME,
    users: usersWithGames,
    currentUserId: typeof currentUserId === 'number' ? currentUserId : null,
    gameIds: Object.keys(GAME_REGISTRY),
    gameNames: Object.fromEntries(
      Object.entries(GAME_REGISTRY).map(([id, d]) => [id, d.name]),
    ),
    esc: escapeHtml,
    csrfToken: (res.locals as { csrfToken?: string }).csrfToken ?? '',
  });
});

app.post('/admin/game-access', adminLimiter, requireAdmin, (req, res) => {
  const userId = parseInt(String(req.body?.user_id ?? 0), 10);
  const gameId = String(req.body?.game_id ?? '').trim();
  const rawEnabled = req.body?.enabled;
  let enabled: boolean;
  if (rawEnabled === undefined || rawEnabled === null) {
    enabled = false;
  } else if (typeof rawEnabled === 'boolean') {
    enabled = rawEnabled;
  } else if (typeof rawEnabled === 'number') {
    enabled = rawEnabled !== 0;
  } else {
    const s = String(rawEnabled).toLowerCase().trim();
    enabled = s === 'true' || s === 'on' || s === '1';
  }
  if (userId <= 0 || !gameId) {
    return res.status(400).json({ error: 'user_id and game_id required' });
  }
  if (!(gameId in GAME_REGISTRY)) {
    return res.status(400).json({ error: 'Invalid game_id' });
  }
  const changed = setUserGameAccess(userId, gameId, enabled);
  res.json({ success: true, changed });
});

app.post('/admin/delete-user', adminLimiter, requireAdmin, (req, res) => {
  const currentUserId = (req.session as { user_id?: number }).user_id;
  if (typeof currentUserId !== 'number' || currentUserId <= 0) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  const targetUserId = parseInt(String(req.body?.user_id ?? 0), 10);
  if (targetUserId <= 0) {
    return res.status(400).json({ error: 'user_id required' });
  }
  const result = deleteUser(currentUserId, targetUserId);
  if (result.success) {
    return res.json({ success: true });
  }
  return res.status(400).json({ error: result.error });
});

app.get('/register', adminLimiter, requireAdmin, (req, res) => {
  res.render('register', {
    appName: APP_NAME,
    error: '',
    success: '',
    csrfToken: (res.locals as { csrfToken?: string }).csrfToken ?? '',
  });
});

app.post('/register', adminLimiter, requireAdmin, async (req, res) => {
  const username = String(req.body?.username ?? '').trim();
  const password = String(req.body?.password ?? '');
  const confirmPassword = String(req.body?.confirm_password ?? '');
  const isAdminUser = Boolean(req.body?.is_admin);
  let error = '';
  let success = '';
  if (!username || !password) {
    error = 'Username and password are required.';
  } else if (password !== confirmPassword) {
    error = 'Passwords do not match.';
  } else {
    const result = await createUser(username, password, isAdminUser);
    if (result.success) {
      const safeUsername = escapeHtml(username);
      success = `User '${safeUsername}' created.`;
    } else {
      error = result.error;
    }
  }
  res.render('register', {
    appName: APP_NAME,
    error,
    success,
    username: error ? username : '',
    csrfToken: (res.locals as { csrfToken?: string }).csrfToken ?? '',
  });
});

const mountOptions = {
  csrfToken: (req: express.Request, res: express.Response) =>
    (res as express.Response & { locals?: { csrfToken?: string } }).locals
      ?.csrfToken ?? '',
  appName: APP_NAME,
};
for (const game of GAME_MODULES) {
  const descriptor = GAME_REGISTRY[game.id];
  if (descriptor) game.mount(app, descriptor.path, mountOptions);
}

const server = app.listen(PORT, HOST, () => {
  console.log(`Corpus running at http://${HOST}:${PORT}`);
});

const SHUTDOWN_TIMEOUT_MS = 10_000;
function shutdown(): void {
  let closed = false;
  function exit(): void {
    if (closed) return;
    closed = true;
    try {
      sessionDb.close();
    } catch (e) {
      console.error(e);
    }
    process.exit(0);
  }
  const t = setTimeout(() => exit(), SHUTDOWN_TIMEOUT_MS);
  server.close(() => {
    clearTimeout(t);
    exit();
  });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
