import { requireAuthApi, requireGameAccess } from '@corpus/core';
import type { Request, Response, NextFunction } from 'express';

import * as api from './api.js';

const GAME_ID = 'warframe';

function getAction(req: Request): string {
  const rawQuery = req.query?.action;
  const q = Array.isArray(rawQuery)
    ? (rawQuery[0] ?? '')
    : typeof rawQuery === 'string'
      ? rawQuery
      : '';
  const b = (req.body as { action?: string })?.action ?? '';
  return String(q || b || '').trim();
}

async function processApiAction(req: Request, res: Response): Promise<void> {
  const action = getAction(req);
  switch (action) {
    case 'worksheets':
      await api.handleWorksheets(req, res);
      break;
    case 'data':
      await api.handleData(req, res);
      break;
    case 'update':
      await api.handleUpdate(req, res);
      break;
    case 'add_row':
      await api.handleAddRow(req, res);
      break;
    case 'edit_row':
      await api.handleEditRow(req, res);
      break;
    case 'delete_row':
      await api.handleDeleteRow(req, res);
      break;
    case 'admin_update':
      await api.handleAdminUpdate(req, res);
      break;
    default:
      res.status(400).json({ error: `Unknown action: ${action || '(empty)'}` });
  }
}

function runMiddleware(
  middleware: (req: Request, res: Response, next: NextFunction) => void,
  req: Request,
  res: Response,
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = (): void => {
      res.removeListener('finish', onFinish);
      res.removeListener('close', onClose);
    };
    const onFinish = (): void => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(false);
    };
    const onClose = (): void => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(false);
    };
    res.once('finish', onFinish);
    res.once('close', onClose);
    try {
      middleware(req, res, (err?: unknown) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (err) {
          reject(err);
          return;
        }
        if (res.headersSent) {
          resolve(false);
          return;
        }
        resolve(true);
      });
    } catch (err) {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    }
  });
}

export function apiRouter(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  void (async () => {
    try {
      const canProceed = await runMiddleware(
        requireGameAccess(GAME_ID),
        req,
        res,
      );
      if (!canProceed || res.headersSent) return;
      const authOk = await runMiddleware(requireAuthApi, req, res);
      if (!authOk || res.headersSent) return;
      await processApiAction(req, res);
    } catch (err) {
      next(err);
    }
  })();
}
