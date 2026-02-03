import { requireAuthApi, requireGameAccess } from '@corpus/core';
import type { Request, Response, NextFunction } from 'express';

import * as api from './api.js';

const GAME_ID = 'epic7';

function getAction(req: Request): string {
  const qRaw = req.query?.action;
  const q =
    typeof qRaw === 'string'
      ? qRaw
      : Array.isArray(qRaw)
        ? String(qRaw[0] ?? '')
        : '';
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
  'admin_base_heroes',
  'admin_base_artifacts',
  'admin_add_base_hero',
  'admin_add_base_artifact',
  'admin_delete_base_hero',
  'admin_delete_base_artifact',
] as const;

type AllowedAction = (typeof ALLOWED_ACTIONS)[number];

const handlers: Record<
  AllowedAction,
  (req: Request, res: Response) => void | Promise<void>
> = {
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
  admin_base_heroes: api.handleAdminBaseHeroes,
  admin_base_artifacts: api.handleAdminBaseArtifacts,
  admin_add_base_hero: api.handleAdminAddBaseHero,
  admin_add_base_artifact: api.handleAdminAddBaseArtifact,
  admin_delete_base_hero: api.handleAdminDeleteBaseHero,
  admin_delete_base_artifact: api.handleAdminDeleteBaseArtifact,
};

function isValidAction(action: string): action is AllowedAction {
  return ALLOWED_ACTIONS.includes(action as AllowedAction);
}

async function handleAction(
  action: AllowedAction,
  req: Request,
  res: Response,
): Promise<void> {
  const handler = handlers[action];
  const result = handler(req, res);
  await result;
}

export function apiRouter(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  requireGameAccess(GAME_ID)(req, res, () => {
    requireAuthApi(req, res, async () => {
      try {
        const action = getAction(req);
        if (!action || !isValidAction(action)) {
          res
            .status(400)
            .json({ error: `Unknown action: ${action || '(empty)'}` });
          return;
        }
        await handleAction(action, req, res);
      } catch (error) {
        next(error);
      }
    });
  });
}
