import {
  type AuthSession,
  effectiveAppAdmin,
  getGamesForUser,
  requireAuthApi,
  syncSessionFromAuth,
} from '@codex/core';
import { Router, type Request } from 'express';

import { buildAuthLoginUrl, buildAuthLogoutUrl, proxyAuthLogout } from '../auth/remoteAuth.js';
import { APP_ID, COOKIE_DOMAIN, SECURE_COOKIES, SESSION_COOKIE_NAME } from '../config.js';
import { getGameMetadata, unknownGameMetadata } from '../games/metadataRegistry.js';

export const authRouter = Router();

function codexSession(req: Request): AuthSession {
  return req.session as AuthSession;
}

authRouter.get('/csrf', (_req, res) => {
  res.json({
    csrfToken: (res.locals as { csrfToken?: string }).csrfToken || '',
  });
});

authRouter.get('/me', requireAuthApi, async (req, res) => {
  try {
    const state = await syncSessionFromAuth(req);
    const session = codexSession(req);
    const userId = session?.user_id;
    if (typeof userId !== 'number' || userId <= 0 || !state.authenticated || !state.user) {
      res.status(401).json({ authenticated: false, user: null, apps: [] });
      return;
    }
    const apps = getGamesForUser(userId).map((id) => {
      const metadata = getGameMetadata(id) ?? {
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
        username: session?.username ?? state.user.username,
        is_admin: effectiveAppAdmin(state, APP_ID),
        app: APP_ID,
      },
      app_roles: state.app_roles,
      apps,
    });
  } catch {
    res.status(500).json({ authenticated: false, user: null, apps: [] });
  }
});

authRouter.post('/logout', async (req, res) => {
  try {
    const synced = await proxyAuthLogout(req, res);
    if (!synced) {
      console.warn('[Auth] Upstream logout sync failed for /api/auth/logout');
    }
  } catch (error) {
    console.warn('[Auth] Upstream logout sync threw for /api/auth/logout:', error);
  }

  req.session.destroy((err) => {
    if (err) {
      console.error('[Auth] Failed to destroy session:', err);
      res.status(500).json({ ok: false, error: 'Failed to destroy session' });
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
