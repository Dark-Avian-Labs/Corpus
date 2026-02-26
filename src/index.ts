import {
  type GameModule,
  type GameTheme,
  APP_NAME,
  AUTH_SERVICE_URL,
  BASE_HOST,
  CENTRAL_DB_PATH,
  COOKIE_DOMAIN,
  GAME_HOSTS,
  createCentralSchema,
  getGamesForUser,
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
import { rateLimit } from 'express-rate-limit';
import session from 'express-session';
import fs from 'fs';
import helmet from 'helmet';
import { createRequire } from 'module';
import path from 'path';

import {
  generalLimiter,
  loginLimiter,
  adminLimiter,
} from './middleware/rateLimit.js';
import { sanitizeGamePath } from './sanitizeGamePath.js';

const require = createRequire(import.meta.url);
const SQLiteStore = require('better-sqlite3-session-store')(session);

/** Descriptor for a game used in UI (id, name, path, optional theme). */
export type GameDescriptor = {
  id: string;
  name: string;
  path: string;
  theme?: GameTheme;
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

export { sanitizeGamePath } from './sanitizeGamePath.js';

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
const SECURE_COOKIES = true;
if (process.env.NODE_ENV === 'production' && !TRUST_PROXY) {
  throw new Error(
    'TRUST_PROXY must be enabled in production for secure cross-site cookies.',
  );
}

const app = express();
if (TRUST_PROXY) app.set('trust proxy', 1);

app.set('view engine', 'ejs');
app.set('views', viewsPath);

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const baselineLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1200,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) =>
    req.path === '/healthz' ||
    req.path === '/readyz' ||
    req.path.startsWith('/static/') ||
    req.path.startsWith('/shared/') ||
    req.path === '/favicon.ico',
});
app.use(baselineLimiter);

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
  sameSite: 'none',
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

app.use((_req, res, next) => {
  (res.locals as { userManagementUrl?: string }).userManagementUrl =
    `${AUTH_SERVICE_URL}/admin`;
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

app.use((req, res, next) => {
  const cookieTheme =
    typeof req.cookies?.['dal.theme.mode'] === 'string'
      ? req.cookies['dal.theme.mode']
      : '';
  (res.locals as { themeMode?: 'light' | 'dark' }).themeMode =
    cookieTheme === 'light' ? 'light' : 'dark';
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

app.get('/healthz', (_req, res) => {
  res.json({ status: 'ok', app: 'Corpus' });
});

app.get('/readyz', (_req, res) => {
  try {
    sessionDb.prepare('SELECT 1').get();
    res.json({ status: 'ready', app: 'Corpus' });
  } catch {
    res.status(503).json({ status: 'not_ready', app: 'Corpus' });
  }
});

function publicBaseUrl(): string {
  const configured = process.env.APP_PUBLIC_BASE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');

  if (BASE_HOST === 'localhost' || BASE_HOST.startsWith('localhost:')) {
    return `http://${BASE_HOST}`;
  }

  if (/^https?:\/\//i.test(BASE_HOST)) {
    return BASE_HOST.replace(/\/+$/, '');
  }

  return `https://${BASE_HOST}`;
}

function redirectToAuthLogin(
  req: express.Request,
  res: express.Response,
  fallbackPath = '/',
): void {
  const requested =
    typeof req.query?.next === 'string' && req.query.next
      ? req.query.next
      : req.originalUrl || fallbackPath;
  const next = new URL(requested, publicBaseUrl()).toString();
  const loginUrl = new URL(`${AUTH_SERVICE_URL}/login`);
  loginUrl.searchParams.set('next', next);
  res.redirect(loginUrl.toString());
}

function redirectToAuthLogout(res: express.Response): void {
  const logoutUrl = new URL(`${AUTH_SERVICE_URL}/logout`);
  logoutUrl.searchParams.set(
    'next',
    new URL('/login', publicBaseUrl()).toString(),
  );
  res.redirect(logoutUrl.toString());
}

app.get('/login', generalLimiter, redirectIfAuthenticated, (req, res) => {
  redirectToAuthLogin(req, res);
});

app.post('/login', loginLimiter, redirectIfAuthenticated, (req, res) => {
  redirectToAuthLogin(req, res);
});

app.get('/logout', generalLimiter, (_req, res) => {
  redirectToAuthLogout(res);
});

app.post('/logout', generalLimiter, (_req, res) => {
  redirectToAuthLogout(res);
});

app.get('/change-password', generalLimiter, requireAuth, (req, res) => {
  const csrfToken = (res.locals as { csrfToken?: string }).csrfToken;
  res.render('change-password', {
    appName: APP_NAME,
    csrfToken: typeof csrfToken === 'string' ? csrfToken : '',
    error: '',
    success: '',
  });
});

app.post('/change-password', generalLimiter, requireAuth, async (req, res) => {
  const currentPassword = String(req.body?.current_password ?? '');
  const newPassword = String(req.body?.new_password ?? '');
  const confirmPassword = String(req.body?.confirm_password ?? '');
  const csrfToken =
    typeof req.body?._csrf === 'string'
      ? req.body._csrf
      : typeof req.headers['x-csrf-token'] === 'string'
        ? req.headers['x-csrf-token']
        : '';

  const renderPage = (params: { error?: string; success?: string }): void => {
    const nextCsrfToken = (res.locals as { csrfToken?: string }).csrfToken;
    res.render('change-password', {
      appName: APP_NAME,
      csrfToken: typeof nextCsrfToken === 'string' ? nextCsrfToken : '',
      error: params.error ?? '',
      success: params.success ?? '',
    });
  };

  if (!currentPassword || !newPassword || !confirmPassword) {
    renderPage({ error: 'All password fields are required.' });
    return;
  }
  if (newPassword.length < 8) {
    renderPage({ error: 'New password must be at least 8 characters.' });
    return;
  }
  if (newPassword !== confirmPassword) {
    renderPage({ error: 'New password and confirmation must match.' });
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const upstream = await fetch(
      `${AUTH_SERVICE_URL}/api/auth/change-password`,
      {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          cookie: req.headers.cookie ?? '',
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
        signal: controller.signal,
      },
    );
    const body = (await upstream.json().catch(() => null)) as {
      error?: string;
    } | null;
    if (!upstream.ok) {
      renderPage({
        error: body?.error || 'Failed to change password.',
      });
      return;
    }
    renderPage({ success: 'Password updated successfully.' });
  } catch {
    renderPage({ error: 'Auth service unavailable. Please try again.' });
  } finally {
    clearTimeout(timeout);
  }
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

app.get('/admin', adminLimiter, requireAdmin, (_req, res) => {
  res.redirect(`${AUTH_SERVICE_URL}/admin`);
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
    process.exit(0); // eslint-disable-line n/no-process-exit -- graceful shutdown requires explicit exit
  }
  const t = setTimeout(() => exit(), SHUTDOWN_TIMEOUT_MS);
  server.close(() => {
    clearTimeout(t);
    exit();
  });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
