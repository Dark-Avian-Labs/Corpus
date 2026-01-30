import { Application, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';

import {
  attemptLogin,
  getClientIP,
  isLockedOut,
  getLockoutRemaining,
  getUserForLogin,
  getAccountsForUser,
  createUser,
} from '../auth.js';
import {
  APP_NAME,
  SQLITE_DB_PATH,
  HERO_CLASSES,
  ARTIFACT_CLASSES,
  ELEMENTS,
  HERO_RATINGS,
  RATING_COLORS,
  GAUGE_COLORS,
  CLASS_DISPLAY_NAMES,
  ELEMENT_DISPLAY_NAMES,
  ARTIFACT_GAUGE_MAX,
  ARTIFACT_GAUGE_FILLED,
  ARTIFACT_GAUGE_EMPTY,
} from '../config.js';
import {
  requireAuth,
  requireAdmin,
  redirectIfAuthenticated,
} from '../middleware/auth.js';
import {
  generalLimiter,
  loginLimiter,
  adminLimiter,
} from '../middleware/rateLimit.js';

function getBackgroundArt(): string {
  const distPath = path.join(process.cwd(), 'dist', 'background.txt');
  const rootPath = path.join(process.cwd(), 'background.txt');

  const backgroundPath = fs.existsSync(distPath) ? distPath : rootPath;

  if (!fs.existsSync(backgroundPath)) return '';
  try {
    return fs.readFileSync(backgroundPath, 'utf-8');
  } catch {
    return '';
  }
}

function dbExists(): boolean {
  return fs.existsSync(SQLITE_DB_PATH);
}

export function registerPageRoutes(app: Application): void {
  const art = getBackgroundArt();

  app.get(
    '/login',
    generalLimiter,
    redirectIfAuthenticated,
    (req: Request, res: Response) => {
      const ip = getClientIP(req);
      const lockedOut = isLockedOut(ip);
      const lockoutRemaining = getLockoutRemaining(ip);
      res.render('login', {
        appName: APP_NAME,
        art,
        error: '',
        lockedOut,
        lockoutRemaining,
        dbExists: dbExists(),
        csrfToken: req.csrfToken?.() ?? '',
      });
    },
  );

  app.post(
    '/login',
    loginLimiter,
    redirectIfAuthenticated,
    async (req: Request, res: Response) => {
      const ip = getClientIP(req);
      const lockedOut = isLockedOut(ip);
      const lockoutRemaining = getLockoutRemaining(ip);

      if (lockedOut) {
        return res.render('login', {
          appName: APP_NAME,
          art,
          error: 'Too many failed attempts. Try again later.',
          lockedOut: true,
          lockoutRemaining,
          dbExists: dbExists(),
          csrfToken: req.csrfToken?.() ?? '',
        });
      }

      const username = String(req.body?.username ?? '').trim();
      const password = String(req.body?.password ?? '');

      const result = await attemptLogin(username, password, ip);

      if (result.success) {
        const user = getUserForLogin(username);
        if (!user) {
          return res.render('login', {
            appName: APP_NAME,
            art,
            error: 'Login failed. Please try again.',
            lockedOut: false,
            lockoutRemaining: 0,
            dbExists: dbExists(),
            csrfToken: req.csrfToken?.() ?? '',
          });
        }
        const accounts = getAccountsForUser(user.id);
        let accountId: number | null = null;
        let accountName: string | null = null;
        const active = accounts.find((a) => a.is_active);
        const first = accounts[0];
        if (active) {
          accountId = active.id;
          accountName = active.account_name;
        } else if (first) {
          accountId = first.id;
          accountName = first.account_name;
        }

        const loginErrorPayload = () =>
          res.render('login', {
            appName: APP_NAME,
            art,
            error: 'Login failed. Please try again.',
            lockedOut: false,
            lockoutRemaining: 0,
            dbExists: dbExists(),
            csrfToken: req.csrfToken?.() ?? '',
          });

        req.session.regenerate((err) => {
          if (err) {
            loginErrorPayload();
            return;
          }
          const s = req.session as unknown as {
            user_id?: number;
            username?: string;
            is_admin?: boolean;
            account_id?: number | null;
            account_name?: string | null;
            login_time?: number;
          };
          s.user_id = user.id;
          s.username = user.username;
          s.is_admin = Boolean(user.is_admin);
          s.account_id = accountId;
          s.account_name = accountName;
          s.login_time = Math.floor(Date.now() / 1000);
          req.session.save((saveErr) => {
            if (saveErr) {
              return loginErrorPayload();
            }
            return res.redirect('/');
          });
          return;
        });
        return undefined;
      }

      return res.render('login', {
        appName: APP_NAME,
        art,
        error: result.error,
        lockedOut: isLockedOut(ip),
        lockoutRemaining: getLockoutRemaining(ip),
        dbExists: dbExists(),
        csrfToken: req.csrfToken?.() ?? '',
      });
    },
  );

  app.get('/logout', (req: Request, res: Response) => {
    req.session.destroy(() => {
      res.redirect('/login');
    });
  });

  app.get('/', generalLimiter, requireAuth, (req: Request, res: Response) => {
    const s = req.session as unknown as { is_admin?: boolean };
    res.render('index', {
      appName: APP_NAME,
      art,
      isAdmin: Boolean(s.is_admin),
      heroClasses: HERO_CLASSES,
      artifactClasses: ARTIFACT_CLASSES,
      elements: ELEMENTS,
      heroRatings: HERO_RATINGS,
      ratingColors: RATING_COLORS,
      gaugeColors: GAUGE_COLORS,
      classNames: CLASS_DISPLAY_NAMES,
      elementNames: ELEMENT_DISPLAY_NAMES,
      gaugeMax: ARTIFACT_GAUGE_MAX,
      gaugeFilled: ARTIFACT_GAUGE_FILLED,
      gaugeEmpty: ARTIFACT_GAUGE_EMPTY,
      csrfToken: req.csrfToken?.() ?? '',
    });
  });

  app.get(
    '/admin',
    adminLimiter,
    requireAdmin,
    (req: Request, res: Response) => {
      res.render('admin', {
        appName: APP_NAME,
        art,
        heroClasses: HERO_CLASSES,
        artifactClasses: ARTIFACT_CLASSES,
        elements: ELEMENTS,
        classNames: CLASS_DISPLAY_NAMES,
        elementNames: ELEMENT_DISPLAY_NAMES,
        csrfToken: req.csrfToken?.() ?? '',
      });
    },
  );

  app.get(
    '/register',
    adminLimiter,
    requireAdmin,
    (req: Request, res: Response) => {
      res.render('register', {
        appName: APP_NAME,
        art,
        error: '',
        success: '',
        csrfToken: req.csrfToken?.() ?? '',
      });
    },
  );

  app.post(
    '/register',
    adminLimiter,
    requireAdmin,
    async (req: Request, res: Response) => {
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
          success = `User '${username}' created successfully!`;
        } else {
          error = result.error;
        }
      }

      res.render('register', {
        appName: APP_NAME,
        art,
        error,
        success,
        username: error ? username : '',
        csrfToken: req.csrfToken?.() ?? '',
      });
    },
  );
}
