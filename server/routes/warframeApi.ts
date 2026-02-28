import { requireGameAccess } from '@corpus/core';
import { validateBody } from '@corpus/core/validation';
import {
  HELMINTH_VALUES,
  VALID_STATUSES,
  WARFRAME_DB_PATH,
  getWarframeDb,
  isHelminthValue,
  isValidStatus,
  warframeAddRowSchema,
  warframeAdminUpdateSchema,
  warframeDeleteRowSchema,
  warframeEditRowSchema,
  warframeQueries as q,
  warframeUpdateSchema,
} from '@corpus/game-warframe';
import { Router, type Request, type Response } from 'express';
import fs from 'fs';

import { requireAdmin, requireAuthApi } from '../auth/middleware.js';
import { runWarframeSync } from '../services/warframeSync.js';

export const warframeApiRouter = Router();

warframeApiRouter.use(requireAuthApi, requireGameAccess('warframe'));

function getUserId(req: Request): number | null {
  const id = (req.session as { user_id?: number })?.user_id;
  return typeof id === 'number' && id > 0 ? id : null;
}

async function getDbOrFail(
  res: Response,
): Promise<ReturnType<typeof getWarframeDb> | null> {
  try {
    await fs.promises.access(WARFRAME_DB_PATH);
  } catch {
    res.status(500).json({ error: 'Database not found.' });
    return null;
  }
  try {
    return getWarframeDb();
  } catch (error) {
    console.error('Failed to open Warframe database connection:', error);
    res.status(500).json({ error: 'Database connection failed.' });
    return null;
  }
}

function getAdminActorId(req: Request): number | null {
  const userFromSessionSnake = (req.session as { user_id?: unknown })?.user_id;
  if (
    typeof userFromSessionSnake === 'number' &&
    Number.isInteger(userFromSessionSnake) &&
    userFromSessionSnake > 0
  ) {
    return userFromSessionSnake;
  }
  const userFromSessionCamel = (req.session as { userId?: unknown })?.userId;
  if (
    typeof userFromSessionCamel === 'number' &&
    Number.isInteger(userFromSessionCamel) &&
    userFromSessionCamel > 0
  ) {
    return userFromSessionCamel;
  }
  const userFromReqUser = (req as { user?: { id?: unknown } }).user?.id;
  if (
    typeof userFromReqUser === 'number' &&
    Number.isInteger(userFromReqUser) &&
    userFromReqUser > 0
  ) {
    return userFromReqUser;
  }
  return null;
}

const ALLOWED_UPDATE_VALUES = ['', 'Obtained', 'Complete'];

type ValidateColumnValuesInvalidEntry = {
  column_id: string;
  value: string;
  reason: string;
  allowed: readonly string[];
};

function validateColumnValues(
  valuesRaw: Record<string, string>,
  columns: { id: number; name: string }[],
): {
  valid: Record<number, string>;
  invalid: ValidateColumnValuesInvalidEntry[];
} {
  const valid: Record<number, string> = {};
  const invalid: ValidateColumnValuesInvalidEntry[] = [];
  for (const [key, value] of Object.entries(valuesRaw)) {
    const id = parseInt(key, 10);
    if (Number.isNaN(id)) {
      invalid.push({
        column_id: key,
        value,
        reason: 'invalid column_id (must be a number)',
        allowed: [],
      });
      continue;
    }
    const col = columns.find((column) => column.id === id);
    if (!col) {
      invalid.push({
        column_id: key,
        value,
        reason: 'unknown column for this worksheet',
        allowed: columns.map((column) => String(column.id)),
      });
      continue;
    }
    const validValue =
      col.name === 'Helminth' ? isHelminthValue(value) : isValidStatus(value);
    if (!validValue) {
      invalid.push({
        column_id: key,
        value,
        reason:
          col.name === 'Helminth'
            ? 'invalid value for Helminth column'
            : 'invalid status value',
        allowed:
          col.name === 'Helminth' ? [...HELMINTH_VALUES] : [...VALID_STATUSES],
      });
    } else {
      valid[id] = value;
    }
  }
  return { valid, invalid };
}

warframeApiRouter.get('/worksheets', (req, res) => {
  void (async () => {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const db = await getDbOrFail(res);
    if (!db) return;
    try {
      const worksheets = await q.getWorksheets(db, userId);
      res.status(200).json({ worksheets });
    } catch (error) {
      console.error('Failed to fetch worksheets:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    } finally {
      db.close();
    }
  })();
});

warframeApiRouter.get('/worksheets/:worksheetId', (req, res) => {
  void (async () => {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const worksheetId = Number(req.params.worksheetId);
    if (!Number.isInteger(worksheetId) || worksheetId <= 0) {
      res.status(400).json({ error: 'Invalid worksheet id.' });
      return;
    }
    const db = await getDbOrFail(res);
    if (!db) return;
    try {
      const data = await q.getWorksheetData(db, worksheetId, userId);
      if (!data) {
        res.status(404).json({ error: 'Worksheet not found.' });
        return;
      }
      res.status(200).json({
        worksheet: data.worksheet,
        columns: data.columns,
        rows: data.rows,
      });
    } catch (error) {
      console.error('Failed to fetch worksheet data:', error);
      res.status(500).json({ error: 'Failed to fetch worksheet.' });
    } finally {
      db.close();
    }
  })();
});

warframeApiRouter.patch('/cells', (req, res) => {
  void (async () => {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const data = validateBody(warframeUpdateSchema, req.body, res);
    if (!data) return;
    const db = await getDbOrFail(res);
    if (!db) return;
    try {
      const col = q.getColumnById(db, data.column_id, userId);
      if (!col) {
        res.status(400).json({ error: 'Column not found or access denied.' });
        return;
      }
      const isHelminth = col.name === 'Helminth';
      const current = q.getCellValue(db, data.row_id, data.column_id, userId);
      if (current === data.value) {
        res.status(200).json({ success: true, value: data.value });
        return;
      }
      if (isHelminth) {
        if (!isHelminthValue(data.value)) {
          res.status(400).json({ error: 'Invalid value for Helminth.' });
          return;
        }
      } else {
        if (!ALLOWED_UPDATE_VALUES.includes(data.value)) {
          res.status(400).json({ error: 'Invalid status value.' });
          return;
        }
        if (current === 'Unavailable') {
          res.status(400).json({ error: 'Cannot modify unavailable items.' });
          return;
        }
      }
      const changes = q.updateCell(
        db,
        data.row_id,
        data.column_id,
        data.value,
        userId,
      );
      if (changes <= 0) {
        res
          .status(404)
          .json({ error: 'Update failed: row or column not updated.' });
        return;
      }
      res.status(200).json({ success: true, value: data.value });
    } catch (error) {
      res.status(400).json({
        error:
          error instanceof Error ? error.message : 'Failed to update cell.',
      });
    } finally {
      db.close();
    }
  })();
});

warframeApiRouter.post('/rows', (req, res) => {
  void (async () => {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const data = validateBody(warframeAddRowSchema, req.body, res);
    if (!data) return;
    const db = await getDbOrFail(res);
    if (!db) return;
    try {
      const columns = q.getWorksheetColumns(db, data.worksheet_id, userId);
      if (columns.length === 0) {
        res
          .status(403)
          .json({ error: 'Worksheet not found or access denied.' });
        return;
      }
      const { valid, invalid } = validateColumnValues(data.values, columns);
      if (invalid.length > 0) {
        res.status(400).json({ error: 'Invalid column/value(s).', invalid });
        return;
      }
      try {
        const rowId = q.addRow(
          db,
          data.worksheet_id,
          userId,
          data.item_name,
          valid,
        );
        res.status(201).json({ success: true, row_id: rowId });
      } catch (error) {
        console.error('Failed to add row:', error);
        res.status(500).json({
          error: error instanceof Error ? error.message : 'Failed to add row.',
        });
      }
    } finally {
      db.close();
    }
  })();
});

warframeApiRouter.patch('/rows/:rowId', (req, res) => {
  void (async () => {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const data = validateBody(
      warframeEditRowSchema,
      { ...req.body, row_id: Number(req.params.rowId) },
      res,
    );
    if (!data) return;
    const db = await getDbOrFail(res);
    if (!db) return;
    try {
      const worksheetId = q.getRowWorksheetId(db, data.row_id, userId);
      if (worksheetId === null) {
        res.status(404).json({ error: 'Row not found.' });
        return;
      }
      const columns = q.getWorksheetColumns(db, worksheetId, userId);
      const { valid, invalid } = validateColumnValues(data.values, columns);
      if (invalid.length > 0) {
        res.status(400).json({ error: 'Invalid column/value(s).', invalid });
        return;
      }
      const ok = q.editRow(db, data.row_id, userId, data.item_name, valid);
      if (!ok) {
        res.status(404).json({ error: 'Row not found.' });
        return;
      }
      res.status(200).json({ success: true });
    } catch (error) {
      console.error('Failed to edit row:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    } finally {
      db.close();
    }
  })();
});

warframeApiRouter.delete('/rows/:rowId', (req, res) => {
  void (async () => {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const data = validateBody(
      warframeDeleteRowSchema,
      { row_id: Number(req.params.rowId) },
      res,
    );
    if (!data) return;
    const db = await getDbOrFail(res);
    if (!db) return;
    try {
      const ok = q.deleteRow(db, data.row_id, userId);
      if (!ok) {
        res.status(404).json({ error: 'Row not found.' });
        return;
      }
      res.status(200).json({ success: true });
    } catch (error) {
      console.error('Failed to delete row:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    } finally {
      db.close();
    }
  })();
});

warframeApiRouter.patch('/admin/cells', requireAdmin, (req, res) => {
  void (async () => {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const data = validateBody(warframeAdminUpdateSchema, req.body, res);
    if (!data) return;
    const db = await getDbOrFail(res);
    if (!db) return;
    try {
      const result = q.adminUpdateCell(
        db,
        data.row_id,
        data.column_id,
        data.value,
        userId,
      );
      if (result <= 0) {
        res.status(404).json({ error: 'Row or column not updated.' });
        return;
      }
      res.status(200).json({ success: true, value: data.value });
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Invalid status value.',
      });
    } finally {
      db.close();
    }
  })();
});

warframeApiRouter.get('/admin/sync-preview', requireAdmin, (req, res) => {
  void (async () => {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const db = await getDbOrFail(res);
    if (!db) return;
    try {
      const result = runWarframeSync(db, {
        execute: false,
        userIds: [userId],
      });
      res.status(200).json(result);
    } catch (error) {
      console.error('Failed to build Warframe sync preview:', error);
      res.status(500).json({
        error:
          error instanceof Error
            ? error.message
            : 'Failed to build Warframe sync preview.',
      });
    } finally {
      db.close();
    }
  })();
});

warframeApiRouter.post('/admin/sync-source', requireAdmin, (req, res) => {
  void (async () => {
    const adminUserId = getAdminActorId(req);
    if (!adminUserId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const db = await getDbOrFail(res);
    if (!db) return;
    try {
      console.info('Starting Warframe sync execution', { userId: adminUserId });
      const result = runWarframeSync(db, {
        execute: true,
        initiatedByUserId: adminUserId,
      });
      res.status(200).json(result);
    } catch (error) {
      console.error('Failed to execute Warframe sync:', {
        userId: adminUserId,
        error,
      });
      res.status(500).json({
        error:
          error instanceof Error
            ? error.message
            : 'Failed to execute Warframe sync.',
      });
    } finally {
      db.close();
    }
  })();
});
