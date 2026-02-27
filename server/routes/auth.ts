import { getGamesForUser } from '@corpus/core';
import { Router } from 'express';

import { buildAuthLoginUrl, buildAuthLogoutUrl } from '../auth/remoteAuth.js';
import {
  APP_ID,
  COOKIE_DOMAIN,
  SECURE_COOKIES,
  SESSION_COOKIE_NAME,
} from '../config.js';

export const authRouter = Router();

type GameAppMetadata = {
  label: string;
  subtitle: string;
  url: string;
};

const gameMetadata: Record<string, GameAppMetadata> = {
  epic7: {
    label: 'Epic Seven',
    subtitle: 'Collection tracker',
    url: '/epic7',
  },
  warframe: {
    label: 'Warframe',
    subtitle: 'Inventory tracker',
    url: '/warframe',
  },
};

const unknownGameMetadata: GameAppMetadata = {
  label: 'Unknown Game',
  subtitle: 'Unknown app',
  url: '/apps',
};

authRouter.get('/csrf', (_req, res) => {
  res.json({
    csrfToken: (res.locals as { csrfToken?: string }).csrfToken || '',
  });
});

authRouter.get('/me', (req, res) => {
  const userId = req.session.user_id;
  if (typeof userId !== 'number' || userId <= 0) {
    res.status(401).json({ authenticated: false, user: null, apps: [] });
    return;
  }
  const apps = getGamesForUser(userId).map((id) => {
    const metadata = gameMetadata[id] ?? {
      ...unknownGameMetadata,
      url: `/${id}`,
    };
    return {
      id,
      ...metadata,
    };
  });
  res.json({
    authenticated: true,
    user: {
      id: userId,
      username: req.session.username ?? 'user',
      is_admin: req.session.is_admin === true,
      avatar: req.session.avatar ?? 1,
      app: APP_ID,
    },
    apps,
  });
});

authRouter.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('[Auth] Failed to destroy session:', err);
      res
        .status(500)
        .json({ ok: false, error: 'Failed to destroy session' });
      return;
    }
    res.clearCookie(SESSION_COOKIE_NAME, {
      domain: COOKIE_DOMAIN,
      httpOnly: true,
      sameSite: SECURE_COOKIES ? 'none' : 'lax',
      secure: SECURE_COOKIES,
    });
    res.json({ ok: true, next: '/login' });
  });
});

authRouter.get('/login-url', (req, res) => {
  res.json({ url: buildAuthLoginUrl(req) });
});

authRouter.get('/logout-url', (_req, res) => {
  res.json({ url: buildAuthLogoutUrl('/login') });
});
