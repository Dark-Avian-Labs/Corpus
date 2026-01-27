import Database from 'better-sqlite3';
import cookieParser from 'cookie-parser';
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
const PORT = parseInt(process.env.PORT ?? '3001', 10);
const SESSION_SECRET = process.env.SESSION_SECRET ?? 'epic7-tracker-dev-secret';
const TRUST_PROXY =
  process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY === 'true';
const SECURE_COOKIES =
  process.env.SECURE_COOKIES === '1' || process.env.SECURE_COOKIES === 'true';

if (TRUST_PROXY) {
  app.set('trust proxy', 1);
}

app.set('view engine', 'ejs');
app.set('views', viewsPath);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        // eslint-disable-next-line quotes
        defaultSrc: ["'self'"],
        // eslint-disable-next-line quotes
        styleSrc: ["'self'", "'unsafe-inline'"],
        // eslint-disable-next-line quotes
        scriptSrc: ["'self'", "'unsafe-inline'"],
        // eslint-disable-next-line quotes
        imgSrc: ["'self'", 'data:', 'https:'],
        // eslint-disable-next-line quotes
        fontSrc: ["'self'"],
        // eslint-disable-next-line quotes
        connectSrc: ["'self'"],
        // eslint-disable-next-line quotes
        frameSrc: ["'none'"],
        // eslint-disable-next-line quotes
        objectSrc: ["'none'"],
        // eslint-disable-next-line quotes
        baseUri: ["'self'"],
        // eslint-disable-next-line quotes
        formAction: ["'self'"],
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

const { csrfSynchronisedProtection, generateToken } = csrfSync({
  ignoredMethods: ['GET', 'HEAD', 'OPTIONS'],
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

app.listen(PORT, () => {
  console.log(`Epic7 Collection Tracker running at http://localhost:${PORT}`);
});
