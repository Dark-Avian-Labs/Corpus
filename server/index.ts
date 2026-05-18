import { createRequire } from 'module';
import path from 'path';

import { requireAuth, requireAdmin } from '@codex/core';
import { closeEpic7Db, getEpic7Db } from '@codex/game-epic7';
import { closeWarframeDb, getWarframeDb } from '@codex/game-warframe';
import cookieParser from 'cookie-parser';
import { csrfSync } from 'csrf-sync';
import express, { type Request, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import session from 'express-session';
import helmet from 'helmet';

import { pingAuthServiceHealth } from './auth/authHealth.js';
import { buildAuthLoginUrl, proxyAuthLogout } from './auth/remoteAuth.js';
import {
  APP_NAME,
  APP_PUBLIC_BASE_URL,
  APP_VERSION,
  AUTH_SERVICE_URL,
  COOKIE_DOMAIN,
  HOST,
  NODE_ENV,
  PORT,
  PROJECT_ROOT,
  SECURE_COOKIES,
  SESSION_COOKIE_NAME,
  SESSION_SECRET,
  TRUST_PROXY,
  ensureDataDirs,
} from './config.js';
import { ensureCentralSchema } from './db/centralSchema.js';
import { closeCentralDb, getCentralDb } from './db/connection.js';
import { refreshEpic7DbAvailability } from './epic7DbState.js';
import { getRequestId, requestIdMiddleware } from './http/requestId.js';
import { log } from './logger.js';
import { apiRouter } from './routes/api.js';
import { authRouter } from './routes/auth.js';
import { waitForWarframeSyncIdle } from './services/warframeSyncState.js';

const require = createRequire(import.meta.url);
const SQLiteStore = require('better-sqlite3-session-store')(session);
const STATUS_TEXT: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  409: 'Conflict',
  422: 'Unprocessable Entity',
  429: 'Too Many Requests',
};

ensureDataDirs();
ensureCentralSchema();
const centralDb = getCentralDb();
function assertTableExists(db: { prepare: (sql: string) => unknown }, tableName: string): void {
  const row = (
    db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?") as {
      get: (param: string) => unknown;
    }
  ).get(tableName);
  if (!row) {
    throw new Error(`Required table "${tableName}" was not found.`);
  }
}

function ensureGameSchemasReady(): void {
  const warframeDb = getWarframeDb();
  const epic7Db = getEpic7Db();
  assertTableExists(warframeDb, 'worksheets');
  assertTableExists(warframeDb, 'columns');
  assertTableExists(warframeDb, 'rows');
  assertTableExists(warframeDb, 'cell_values');

  assertTableExists(epic7Db, 'game_accounts');
  assertTableExists(epic7Db, 'base_heroes');
  assertTableExists(epic7Db, 'base_artifacts');
  assertTableExists(epic7Db, 'account_heroes');
  assertTableExists(epic7Db, 'account_artifacts');
}
ensureGameSchemasReady();
void refreshEpic7DbAvailability();

const app = express();
if (TRUST_PROXY) app.set('trust proxy', 1);
if (NODE_ENV === 'production' && SECURE_COOKIES && !TRUST_PROXY) {
  throw new Error(
    'TRUST_PROXY must be enabled in production with secure cookies so Express trusts X-Forwarded-* headers behind your TLS terminator. Set TRUST_PROXY=1 (or enable trust proxy in config) when deploying behind a reverse proxy.',
  );
}

app.use(helmet());
app.use(requestIdMiddleware);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

const RATE_LIMIT_SKIP_PATHS = new Set([
  '/healthz',
  '/readyz',
  '/api/version',
  '/favicon.ico',
  '/login',
  '/legal',
  '/logout',
  '/admin',
  '/warframe/admin',
  '/epic7/admin',
  '/warframe',
  '/epic7',
  '/',
  '/auth/login',
  '/auth/profile',
  '/auth/legal',
]);
const RATE_LIMIT_SKIP_PATTERNS = [/^\/assets\/.+\.(?:css|js|png|jpe?g|gif|webp|svg|ico|woff2?)$/i];

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const BASELINE_RATE_LIMIT_MAX = 1200;
const STATIC_ASSET_RATE_LIMIT_MAX = 5000;

function createRateLimiter(
  max: number,
  options?: { skip?: (req: Request) => boolean },
): ReturnType<typeof rateLimit> {
  return rateLimit({
    windowMs: RATE_LIMIT_WINDOW_MS,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    ...(options?.skip ? { skip: options.skip } : {}),
  });
}

const baselineLimiter = createRateLimiter(BASELINE_RATE_LIMIT_MAX, {
  skip: (req) =>
    RATE_LIMIT_SKIP_PATHS.has(req.path) ||
    RATE_LIMIT_SKIP_PATTERNS.some((pattern) => pattern.test(req.path)),
});
app.use(baselineLimiter);

const sessionStore = new SQLiteStore({
  client: centralDb,
  expired: { clear: true, intervalMs: 15 * 60 * 1000 },
});

const cookieOptions: express.CookieOptions = {
  maxAge: 7 * 24 * 60 * 60 * 1000,
  httpOnly: true,
  secure: SECURE_COOKIES,
  sameSite: SECURE_COOKIES ? 'none' : 'lax',
  domain: COOKIE_DOMAIN,
};

app.use(
  session({
    name: SESSION_COOKIE_NAME,
    store: sessionStore,
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: cookieOptions,
  }),
);

const { csrfSynchronisedProtection, generateToken } = csrfSync({
  getTokenFromRequest: (req: Request) => {
    if (req.body?._csrf) return req.body._csrf as string;
    const header = req.headers['x-csrf-token'] || req.headers['x-xsrf-token'];
    return (Array.isArray(header) ? header[0] : header) ?? null;
  },
  getTokenFromState: (req) => {
    const sessionData = req.session;
    if (!sessionData) return null;
    return sessionData.csrfToken ?? null;
  },
  storeTokenInState: (req, token) => {
    if (req.session) {
      req.session.csrfToken = token as string;
    }
  },
});
app.use(csrfSynchronisedProtection);
app.use((req, res, next) => {
  (res.locals as { csrfToken?: string }).csrfToken = generateToken(req);
  next();
});

const IS_DEV_ENV = NODE_ENV !== 'production';
const defaultDevOrigins = IS_DEV_ENV
  ? [
      'http://localhost',
      'http://127.0.0.1',
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://localhost:4173',
      'http://127.0.0.1:4173',
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://localhost:8080',
      'http://127.0.0.1:8080',
    ]
  : [];
const configuredOrigins = [process.env.ALLOWED_APP_ORIGINS, AUTH_SERVICE_URL]
  .filter((value): value is string => typeof value === 'string' && value.length > 0)
  .join(',');
const originCandidates = configuredOrigins
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const excludedOrigins: string[] = [];
const ALLOWED_APP_ORIGINS = [...new Set([...originCandidates, ...defaultDevOrigins])].filter(
  (value) => {
    const isHttps = value.startsWith('https://');
    const isDevHttp = IS_DEV_ENV && value.startsWith('http://');
    const allowed = isHttps || isDevHttp;
    if (!allowed) excludedOrigins.push(value);
    return allowed;
  },
);
if (excludedOrigins.length > 0) {
  console.warn('[CORS] Excluded app origins from ALLOWED_APP_ORIGINS:', excludedOrigins);
}

const CSRF_PROTECTED_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
app.use((req: Request, res: Response, next) => {
  if (!CSRF_PROTECTED_METHODS.has(req.method.toUpperCase())) {
    next();
    return;
  }

  const secFetchSiteHeader = req.headers['sec-fetch-site'];
  const secFetchSite = Array.isArray(secFetchSiteHeader)
    ? secFetchSiteHeader[0]
    : secFetchSiteHeader;
  if (typeof secFetchSite === 'string' && secFetchSite.toLowerCase() === 'cross-site') {
    res.status(403).json({ error: 'Cross-site request blocked', code: 'CSRF_ORIGIN_INVALID' });
    return;
  }

  const originHeader = req.headers.origin;
  const origin = Array.isArray(originHeader) ? originHeader[0] : originHeader;
  if (typeof origin === 'string' && origin.length > 0) {
    const allowedOrigins = new Set<string>([APP_PUBLIC_BASE_URL, ...ALLOWED_APP_ORIGINS]);
    if (!allowedOrigins.has(origin)) {
      res.status(403).json({ error: 'Origin not allowed', code: 'CSRF_ORIGIN_INVALID' });
      return;
    }
  }

  next();
});

app.use((req: Request, res: Response, next) => {
  const origin = req.headers.origin;
  if (typeof origin === 'string' && ALLOWED_APP_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-CSRF-Token, X-XSRF-Token');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
  }
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
});

app.use('/api/auth', authRouter);

app.get('/api/version', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ version: APP_VERSION });
});

app.use('/api', apiRouter);
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

const publicPageLimiter = createRateLimiter(BASELINE_RATE_LIMIT_MAX);
const staticAssetLimiter = createRateLimiter(STATIC_ASSET_RATE_LIMIT_MAX);

const clientDir = path.join(PROJECT_ROOT, 'dist', 'client');
const clientIndexPath = path.join(clientDir, 'index.html');
app.use(
  '/assets',
  staticAssetLimiter,
  express.static(path.join(clientDir, 'assets'), {
    maxAge: '1y',
    immutable: true,
  }),
);
app.use(publicPageLimiter, express.static(clientDir, { maxAge: '1h' }));

app.get('/favicon.ico', publicPageLimiter, (_req, res) => {
  res.sendFile(path.join(PROJECT_ROOT, 'favicon.ico'));
});
app.get('/healthz', (_req, res) => {
  res.json({ status: 'ok', app: APP_NAME });
});
app.get('/readyz', async (_req, res) => {
  try {
    centralDb.prepare('SELECT 1').get();
    getWarframeDb().prepare('SELECT 1').get();
    getEpic7Db().prepare('SELECT 1').get();
    const authOk = await pingAuthServiceHealth(AUTH_SERVICE_URL);
    if (!authOk) {
      res.status(503).json({ status: 'not_ready', app: APP_NAME, reason: 'auth_unavailable' });
      return;
    }
    res.json({ status: 'ready', app: APP_NAME });
  } catch {
    res.status(503).json({ status: 'not_ready', app: APP_NAME });
  }
});

app.get('/login', publicPageLimiter, (req, res) => {
  res.redirect(buildAuthLoginUrl(req, '/'));
});
app.get('/legal', publicPageLimiter, (_req, res) => {
  res.redirect(`${AUTH_SERVICE_URL}/legal`);
});
async function clearLocalSessionAndRedirectToAuthLogout(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const synced = await proxyAuthLogout(req, res);
    if (!synced) {
      console.warn('[Auth] Upstream logout sync failed.');
    }
  } catch (error) {
    console.warn('[Auth] Upstream logout sync failed:', error);
  }
  req.session.destroy((err) => {
    if (err) {
      console.warn('[Session] Failed to destroy session during logout:', err);
    }
    res.clearCookie(SESSION_COOKIE_NAME, {
      domain: COOKIE_DOMAIN,
      httpOnly: true,
      sameSite: SECURE_COOKIES ? 'none' : 'lax',
      secure: SECURE_COOKIES,
    });
    res.redirect('/login');
  });
}
app.post('/logout', publicPageLimiter, async (req, res) => {
  await clearLocalSessionAndRedirectToAuthLogout(req, res);
});
app.get('/logout', publicPageLimiter, (_req, res) => {
  res.set('Allow', 'POST');
  res.status(405).json({ error: 'Use POST /logout' });
});

app.get('/admin', publicPageLimiter, requireAdmin, (_req, res) => {
  res.sendFile(clientIndexPath);
});
app.get('/warframe/admin', publicPageLimiter, requireAdmin, (_req, res) => {
  res.sendFile(clientIndexPath);
});
app.get('/epic7/admin', publicPageLimiter, requireAdmin, (_req, res) => {
  res.sendFile(clientIndexPath);
});
app.get('/warframe', publicPageLimiter, requireAuth, (_req, res) => {
  res.sendFile(clientIndexPath);
});
app.get('/epic7', publicPageLimiter, requireAuth, (_req, res) => {
  res.sendFile(clientIndexPath);
});
app.get('/', publicPageLimiter, requireAuth, (_req, res) => {
  res.sendFile(clientIndexPath);
});

app.get('/auth/login', publicPageLimiter, (req, res) => {
  res.redirect(buildAuthLoginUrl(req, '/'));
});
app.get('/auth/profile', publicPageLimiter, (_req, res) => {
  res.redirect(`${AUTH_SERVICE_URL}/profile`);
});
app.get('/profile', publicPageLimiter, (_req, res) => {
  res.redirect('/auth/profile');
});
app.get('/auth/legal', publicPageLimiter, (_req, res) => {
  res.redirect(`${AUTH_SERVICE_URL}/legal`);
});

app.use((err: unknown, _req: Request, res: Response, _next: express.NextFunction) => {
  const error = err as Partial<Error> & {
    status?: number;
    statusCode?: number;
    code?: string;
  };
  const isCsrfError = error.code === 'EBADCSRFTOKEN';
  if (isCsrfError) {
    res.setHeader('X-CSRF-Error', '1');
  }
  log('error', 'Unhandled request error', {
    requestId: getRequestId(res),
    err: error.stack ?? error.message,
  });
  const status =
    typeof error.status === 'number'
      ? error.status
      : typeof error.statusCode === 'number'
        ? error.statusCode
        : error.name === 'ForbiddenError'
          ? 403
          : 500;
  const isClientError = status >= 400 && status < 500;
  const fallbackStatusText = STATUS_TEXT[status] || 'Request error';
  const message = isClientError
    ? (typeof error.message === 'string' && error.message.trim()) ||
      (typeof error.name === 'string' && error.name.trim()) ||
      fallbackStatusText
    : 'Internal server error';
  res
    .status(status)
    .json(isCsrfError ? { error: message, code: 'CSRF_INVALID' } : { error: message });
});

const server = app.listen(PORT, HOST, () => {
  log('info', `${APP_NAME} server listening`, { host: HOST, port: PORT, nodeEnv: NODE_ENV });
});

const SHUTDOWN_TIMEOUT_MS = 10_000;
let shutdownStarted = false;
function shutdown(): void {
  if (shutdownStarted) return;
  shutdownStarted = true;

  function closeAndExit(exitCode: number): void {
    try {
      closeCentralDb();
      closeWarframeDb();
      closeEpic7Db();
    } catch (err) {
      log('error', 'Failed to close DB connections during shutdown', {
        err: err instanceof Error ? err.message : String(err),
      });
      exitCode = 1;
    }
    // eslint-disable-next-line n/no-process-exit -- explicit process exit required for shutdown lifecycle
    process.exit(exitCode);
  }

  const hardTimeout = setTimeout(() => {
    log('warn', 'Shutdown timeout reached; forcing exit', { timeoutMs: SHUTDOWN_TIMEOUT_MS });
    closeAndExit(1);
  }, SHUTDOWN_TIMEOUT_MS);

  void (async () => {
    try {
      const syncFinished = await waitForWarframeSyncIdle(
        Math.max(SHUTDOWN_TIMEOUT_MS - 2000, 1000),
      );
      if (!syncFinished) {
        log('warn', 'Warframe sync still running; proceeding with shutdown');
      }

      server.close((err) => {
        clearTimeout(hardTimeout);
        if (err) {
          log('error', 'HTTP server close failed', {
            err: err instanceof Error ? err.message : String(err),
          });
          closeAndExit(1);
          return;
        }
        closeAndExit(0);
      });
    } catch (err) {
      log('error', 'Unexpected shutdown error', {
        err: err instanceof Error ? (err.stack ?? err.message) : String(err),
      });
      clearTimeout(hardTimeout);
      closeAndExit(1);
    }
  })();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

export default app;
