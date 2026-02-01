import Database from 'better-sqlite3';
import cookieParser from 'cookie-parser';
import crypto from 'crypto';
import { csrfSync } from 'csrf-sync';
import express from 'express';
import session from 'express-session';
import helmet from 'helmet';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

import { SQLITE_DB_PATH } from './config.js';
import { apiLimiter, generalLimiter } from './middleware/rateLimit.js';
import { apiRouter } from './routes/apiRouter.js';
import { registerPageRoutes } from './routes/pages.js';

const require = createRequire(import.meta.url);
const SQLiteStore = require('better-sqlite3-session-store')(session);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const viewsPath = __dirname.includes('dist')
  ? path.join(process.cwd(), 'dist', 'views')
  : path.join(process.cwd(), 'src', 'views');

const app = express();
const HOST = process.env.HOST ?? '127.0.0.1';
const PORT = parseInt(process.env.PORT ?? '3001', 10);
const SESSION_SECRET = process.env.SESSION_SECRET ?? 'epic7-tracker-dev-secret';
const DEV_SESSION_SECRET = 'epic7-tracker-dev-secret';
if (
  process.env.NODE_ENV === 'production' &&
  SESSION_SECRET === DEV_SESSION_SECRET
) {
  throw new Error(
    'Security: Set SESSION_SECRET to a strong random value in production.',
  );
}
const TRUST_PROXY =
  process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY === 'true';
const SECURE_COOKIES =
  process.env.SECURE_COOKIES === '1' || process.env.SECURE_COOKIES === 'true';

if (TRUST_PROXY) {
  app.set('trust proxy', 1);
}

app.set('view engine', 'ejs');
app.set('views', viewsPath);

app.use((req, res, next) => {
  res.locals.nonce = crypto.randomBytes(16).toString('base64');
  next();
});

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        // prettier-ignore
        defaultSrc: ['\'self\''],
        // prettier-ignore
        styleSrc: ['\'self\'', '\'unsafe-inline\''],
        // prettier-ignore
        scriptSrc: [
          '\'self\'',
          (req, res) => `'nonce-${(res as express.Response).locals.nonce}'`,
        ],
        // prettier-ignore
        imgSrc: ['\'self\'', 'data:', 'https:'],
        // prettier-ignore
        fontSrc: ['\'self\''],
        // prettier-ignore
        connectSrc: ['\'self\''],
        // prettier-ignore
        frameSrc: ['\'none\''],
        // prettier-ignore
        objectSrc: ['\'none\''],
        // prettier-ignore
        baseUri: ['\'self\''],
        // prettier-ignore
        formAction: ['\'self\''],
        upgradeInsecureRequests: [],
      },
    },
  }),
);

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const sessionDb = new Database(SQLITE_DB_PATH);
const sessionStore = new SQLiteStore({
  client: sessionDb,
  expired: {
    clear: true,
    intervalMs: 15 * 60 * 1000,
  },
});

app.use(
  session({
    store: sessionStore,
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 7 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      secure: SECURE_COOKIES,
      sameSite: 'lax',
    },
  }),
);

function getCsrfTokenFromRequest(req: unknown): string | undefined {
  const r = req as express.Request;
  const fromHeader = r.headers?.['x-csrf-token'];
  if (typeof fromHeader === 'string') return fromHeader;
  const body = r.body as { _csrf?: string } | undefined;
  if (body && typeof body._csrf === 'string') return body._csrf;
  return undefined;
}

const { csrfSynchronisedProtection, generateToken } = csrfSync({
  ignoredMethods: ['GET', 'HEAD', 'OPTIONS'],
  getTokenFromRequest: getCsrfTokenFromRequest,
});

app.use((req, res, next) => {
  const token = generateToken(req);
  req.csrfToken = () => token;
  next();
});

app.use(csrfSynchronisedProtection);

const iconsPath = __dirname.includes('dist')
  ? path.join(process.cwd(), 'dist', 'icons')
  : path.join(process.cwd(), 'icons');
app.use('/icons', express.static(iconsPath));

app.get('/favicon.ico', generalLimiter, (req, res) => {
  const favicon = path.join(process.cwd(), 'favicon.ico');
  res.sendFile(favicon, (err) => {
    if (err) res.status(404).end();
  });
});

app.use('/api', apiLimiter, apiRouter);
registerPageRoutes(app);

const server = app.listen(PORT, HOST, () => {
  console.log(`Epic7 Collection Tracker running at http://${HOST}:${PORT}`);
});

function shutdown(): void {
  server.close(() => {
    sessionDb.close();
    // eslint-disable-next-line n/no-process-exit -- intentional graceful shutdown
    process.exit(0);
  });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
