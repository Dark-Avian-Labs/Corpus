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
  const apps = getGamesForUser(userId).map((id) => ({
    id,
    label: id === 'epic7' ? 'Epic Seven' : 'Warframe',
    subtitle: id === 'epic7' ? 'Collection tracker' : 'Inventory tracker',
    url: `/${id}`,
  }));
  res.json({
    authenticated: true,
    user: {
      id: userId,
      username: req.session.username ?? 'user',
      is_admin: req.session.is_admin === true,
      avatar: 1,
      app: APP_ID,
    },
    apps,
  });
});

authRouter.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie(SESSION_COOKIE_NAME, {
      domain: COOKIE_DOMAIN,
      httpOnly: true,
      sameSite: 'none',
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
