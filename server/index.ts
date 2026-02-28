import { requireAuth, requireAdmin } from '@corpus/core';
import cookieParser from 'cookie-parser';
import { csrfSync } from 'csrf-sync';
import express, { type Request, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import session from 'express-session';
import helmet from 'helmet';
import { createRequire } from 'module';
import path from 'path';

import { buildAuthLoginUrl, buildAuthLogoutUrl } from './auth/remoteAuth.js';
import {
  APP_NAME,
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
import { apiRouter } from './routes/api.js';
import { authRouter } from './routes/auth.js';

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

const app = express();
if (TRUST_PROXY) app.set('trust proxy', 1);
if (NODE_ENV === 'production' && SECURE_COOKIES && !TRUST_PROXY) {
  throw new Error(
    'TRUST_PROXY must be enabled in production with secure cookies.',
  );
}

app.use(helmet());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

const baselineLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1200,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) =>
    req.path === '/healthz' ||
    req.path === '/readyz' ||
    req.path === '/favicon.ico' ||
    req.path === '/login' ||
    req.path === '/legal' ||
    req.path === '/logout' ||
    req.path === '/admin' ||
    req.path === '/warframe/admin' ||
    req.path === '/epic7/admin' ||
    req.path === '/warframe' ||
    req.path === '/epic7' ||
    req.path === '/' ||
    req.path === '/auth/login' ||
    req.path === '/auth/profile' ||
    req.path === '/auth/legal' ||
    /^\/assets\/.+\.(?:css|js|png|jpe?g|gif|webp|svg|ico|woff2?)$/i.test(
      req.path,
    ),
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
    return sessionData.csrf_token ?? null;
  },
  storeTokenInState: (req, token) => {
    if (req.session) {
      req.session.csrf_token = token as string;
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
  .filter(
    (value): value is string => typeof value === 'string' && value.length > 0,
  )
  .join(',');
const originCandidates = configuredOrigins
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const excludedOrigins: string[] = [];
const ALLOWED_APP_ORIGINS = [
  ...new Set([...originCandidates, ...defaultDevOrigins]),
].filter((value) => {
  const isHttps = value.startsWith('https://');
  const isDevHttp = IS_DEV_ENV && value.startsWith('http://');
  const allowed = isHttps || isDevHttp;
  if (!allowed) excludedOrigins.push(value);
  return allowed;
});
if (excludedOrigins.length > 0) {
  console.warn(
    '[CORS] Excluded app origins from ALLOWED_APP_ORIGINS:',
    excludedOrigins,
  );
}

app.use((req: Request, res: Response, next) => {
  const origin = req.headers.origin;
  if (typeof origin === 'string' && ALLOWED_APP_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, X-CSRF-Token, X-XSRF-Token',
    );
    res.setHeader(
      'Access-Control-Allow-Methods',
      'GET,POST,PATCH,PUT,DELETE,OPTIONS',
    );
  }
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
});

app.use('/api/auth', authRouter);
app.use('/api', apiRouter);
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

const publicPageLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1200,
  standardHeaders: true,
  legacyHeaders: false,
});
const staticAssetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5000,
  standardHeaders: true,
  legacyHeaders: false,
});

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
app.get('/readyz', (_req, res) => {
  try {
    centralDb.prepare('SELECT 1').get();
    res.json({ status: 'ready', app: APP_NAME });
  } catch {
    res.status(503).json({ status: 'not_ready', app: APP_NAME });
  }
});

app.get('/login', publicPageLimiter, (req, res) => {
  res.redirect(buildAuthLoginUrl(req));
});
app.get('/legal', publicPageLimiter, (_req, res) => {
  res.sendFile(clientIndexPath);
});
function clearLocalSessionAndRedirectToAuthLogout(
  req: Request,
  res: Response,
): void {
  req.session.destroy(() => {
    res.clearCookie(SESSION_COOKIE_NAME, {
      domain: COOKIE_DOMAIN,
      httpOnly: true,
      sameSite: 'none',
      secure: SECURE_COOKIES,
    });
    res.redirect(buildAuthLogoutUrl('/login'));
  });
}
app.get('/logout', publicPageLimiter, (req, res) => {
  clearLocalSessionAndRedirectToAuthLogout(req, res);
});
app.post('/logout', publicPageLimiter, (req, res) => {
  clearLocalSessionAndRedirectToAuthLogout(req, res);
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
  res.redirect(buildAuthLoginUrl(req));
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

app.use(
  (err: unknown, _req: Request, res: Response, _next: express.NextFunction) => {
    const error = err as Partial<Error> & {
      status?: number;
      statusCode?: number;
      code?: string;
    };
    const isCsrfError = error.code === 'EBADCSRFTOKEN';
    if (isCsrfError) {
      res.setHeader('X-CSRF-Error', '1');
    }
    console.error('[Error]', error.stack ?? error.message);
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
      .json(
        isCsrfError
          ? { error: message, code: 'CSRF_INVALID' }
          : { error: message },
      );
  },
);

const server = app.listen(PORT, HOST, () => {
  console.log(
    `[${APP_NAME}] Server running on http://${HOST}:${PORT} (${NODE_ENV})`,
  );
});

const SHUTDOWN_TIMEOUT_MS = 10_000;
let shutdownStarted = false;
function shutdown(): void {
  if (shutdownStarted) return;
  shutdownStarted = true;
  function closeAndExit(): void {
    try {
      closeCentralDb();
    } catch (err) {
      console.error('[Shutdown] Failed to close DB:', err);
    }
    // eslint-disable-next-line n/no-process-exit -- explicit process exit required for shutdown lifecycle
    process.exit(0);
  }
  const timeout = setTimeout(() => closeAndExit(), SHUTDOWN_TIMEOUT_MS);
  server.close(() => {
    clearTimeout(timeout);
    closeAndExit();
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

export default app;
