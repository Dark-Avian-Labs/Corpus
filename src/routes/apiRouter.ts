import { Request, Response, NextFunction } from 'express';

import * as api from './api.js';
import { requireAuthApi } from '../middleware/auth.js';

function getAction(req: Request): string {
  const q = (req.query?.action as string) ?? '';
  const b = (req.body as { action?: string })?.action ?? '';
  return (q || b || '').trim();
}

export function apiRouter(
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  requireAuthApi(req, res, () => {
    const action = getAction(req);
    const handlers: Record<string, (req: Request, res: Response) => void> = {
      worksheets: api.handleWorksheets,
      heroes: api.handleHeroes,
      artifacts: api.handleArtifacts,
      update_hero: api.handleUpdateHero,
      update_artifact: api.handleUpdateArtifact,
      add_hero: api.handleAddHero,
      add_artifact: api.handleAddArtifact,
      delete_hero: api.handleDeleteHero,
      delete_artifact: api.handleDeleteArtifact,
      update_hero_details: api.handleUpdateHeroDetails,
      update_artifact_details: api.handleUpdateArtifactDetails,
      accounts: api.handleAccounts,
      switch_account: api.handleSwitchAccount,
      add_account: api.handleAddAccount,
      delete_account: api.handleDeleteAccount,
      user_info: api.handleUserInfo,
      admin_users: api.handleAdminUsers,
      admin_create_user: api.handleAdminCreateUser,
      admin_delete_user: api.handleAdminDeleteUser,
      admin_reset_password: api.handleAdminResetPassword,
      admin_base_heroes: api.handleAdminBaseHeroes,
      admin_base_artifacts: api.handleAdminBaseArtifacts,
      admin_add_base_hero: api.handleAdminAddBaseHero,
      admin_add_base_artifact: api.handleAdminAddBaseArtifact,
      admin_delete_base_hero: api.handleAdminDeleteBaseHero,
      admin_delete_base_artifact: api.handleAdminDeleteBaseArtifact,
    };
    const handler = handlers[action];
    if (handler) {
      handler(req, res);
    } else {
      res.status(400).json({ error: `Unknown action: ${action || '(empty)'}` });
    }
  });
}
