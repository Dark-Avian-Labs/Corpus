import { Request, Response, NextFunction } from 'express';

import * as api from './api.js';
import { requireAuthApi } from '../middleware/auth.js';

function getAction(req: Request): string {
  const q = (req.query?.action as string) ?? '';
  const b = (req.body as { action?: string })?.action ?? '';
  return (q || b || '').trim();
}

const ALLOWED_ACTIONS = [
  'worksheets',
  'heroes',
  'artifacts',
  'update_hero',
  'update_artifact',
  'add_hero',
  'add_artifact',
  'delete_hero',
  'delete_artifact',
  'update_hero_details',
  'update_artifact_details',
  'accounts',
  'switch_account',
  'add_account',
  'delete_account',
  'user_info',
  'admin_users',
  'admin_create_user',
  'admin_delete_user',
  'admin_reset_password',
  'admin_base_heroes',
  'admin_base_artifacts',
  'admin_add_base_hero',
  'admin_add_base_artifact',
  'admin_delete_base_hero',
  'admin_delete_base_artifact',
] as const;

type AllowedAction = (typeof ALLOWED_ACTIONS)[number];

const handlers: Record<AllowedAction, (req: Request, res: Response) => void> = {
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

function isValidAction(action: string): action is AllowedAction {
  return (
    typeof action === 'string' &&
    action.length > 0 &&
    ALLOWED_ACTIONS.includes(action as AllowedAction)
  );
}

function handleAction(
  action: AllowedAction,
  req: Request,
  res: Response,
): void {
  switch (action) {
    case 'worksheets':
      handlers.worksheets(req, res);
      break;
    case 'heroes':
      handlers.heroes(req, res);
      break;
    case 'artifacts':
      handlers.artifacts(req, res);
      break;
    case 'update_hero':
      handlers.update_hero(req, res);
      break;
    case 'update_artifact':
      handlers.update_artifact(req, res);
      break;
    case 'add_hero':
      handlers.add_hero(req, res);
      break;
    case 'add_artifact':
      handlers.add_artifact(req, res);
      break;
    case 'delete_hero':
      handlers.delete_hero(req, res);
      break;
    case 'delete_artifact':
      handlers.delete_artifact(req, res);
      break;
    case 'update_hero_details':
      handlers.update_hero_details(req, res);
      break;
    case 'update_artifact_details':
      handlers.update_artifact_details(req, res);
      break;
    case 'accounts':
      handlers.accounts(req, res);
      break;
    case 'switch_account':
      handlers.switch_account(req, res);
      break;
    case 'add_account':
      handlers.add_account(req, res);
      break;
    case 'delete_account':
      handlers.delete_account(req, res);
      break;
    case 'user_info':
      handlers.user_info(req, res);
      break;
    case 'admin_users':
      handlers.admin_users(req, res);
      break;
    case 'admin_create_user':
      handlers.admin_create_user(req, res);
      break;
    case 'admin_delete_user':
      handlers.admin_delete_user(req, res);
      break;
    case 'admin_reset_password':
      handlers.admin_reset_password(req, res);
      break;
    case 'admin_base_heroes':
      handlers.admin_base_heroes(req, res);
      break;
    case 'admin_base_artifacts':
      handlers.admin_base_artifacts(req, res);
      break;
    case 'admin_add_base_hero':
      handlers.admin_add_base_hero(req, res);
      break;
    case 'admin_add_base_artifact':
      handlers.admin_add_base_artifact(req, res);
      break;
    case 'admin_delete_base_hero':
      handlers.admin_delete_base_hero(req, res);
      break;
    case 'admin_delete_base_artifact':
      handlers.admin_delete_base_artifact(req, res);
      break;
  }
}

export function apiRouter(
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  requireAuthApi(req, res, () => {
    const action = getAction(req);
    if (!action || !isValidAction(action)) {
      res.status(400).json({ error: `Unknown action: ${action || '(empty)'}` });
      return;
    }
    handleAction(action, req, res);
  });
}
