import { isAdmin } from '@corpus/core';
import type { Request, Response } from 'express';
import fs from 'fs';

import {
  HELMINTH_VALUES,
  isHelminthValue,
  isValidStatus,
  VALID_STATUSES,
  WARFRAME_DB_PATH,
} from '../config.js';
import * as q from '../db/queries.js';
import { getDb } from '../db/schema.js';

type JsonResponse = (data: object, status?: number) => void;

function jsonResponse(res: Response): JsonResponse {
  return (data: object, status = 200) => {
    res.status(status).json(data);
  };
}

function jsonError(res: Response, message: string, status = 400): void {
  res.status(status).json({ error: message });
}

function getUserId(req: Request): number | null {
  const id = (req.session as { user_id?: number })?.user_id;
  return typeof id === 'number' && id > 0 ? id : null;
}

async function getDbOrFail(
  res: Response,
): Promise<ReturnType<typeof getDb> | null> {
  try {
    await fs.promises.access(WARFRAME_DB_PATH);
  } catch {
    jsonError(res, 'Database not found.', 500);
    return null;
  }
  try {
    return getDb();
  } catch {
    jsonError(res, 'Database connection failed.', 500);
    return null;
  }
}

const ALLOWED_UPDATE_VALUES = ['', 'Obtained', 'Complete'];

export type ValidateColumnValuesInvalidEntry = {
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
  for (const [k, v] of Object.entries(valuesRaw)) {
    const id = parseInt(k, 10);
    if (Number.isNaN(id)) {
      invalid.push({
        column_id: k,
        value: v,
        reason: 'invalid column_id (must be a number)',
        allowed: [],
      });
      continue;
    }
    const col = columns.find((c) => c.id === id);
    if (!col) {
      invalid.push({
        column_id: k,
        value: v,
        reason: 'unknown column for this worksheet',
        allowed: columns.map((c) => String(c.id)),
      });
      continue;
    }
    const isValid =
      col.name === 'Helminth' ? isHelminthValue(v) : isValidStatus(v);
    if (!isValid) {
      invalid.push({
        column_id: k,
        value: v,
        reason:
          col.name === 'Helminth'
            ? 'invalid value for Helminth column'
            : 'invalid status value',
        allowed:
          col.name === 'Helminth' ? [...HELMINTH_VALUES] : [...VALID_STATUSES],
      });
    } else {
      valid[id] = v;
    }
  }
  return { valid, invalid };
}

export async function handleWorksheets(
  req: Request,
  res: Response,
): Promise<void> {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const db = await getDbOrFail(res);
  if (!db) return;
  try {
    const worksheets = q.getWorksheets(db, userId);
    jsonResponse(res)({ worksheets });
  } finally {
    db.close();
  }
}

export async function handleData(req: Request, res: Response): Promise<void> {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const db = await getDbOrFail(res);
  if (!db) return;
  try {
    let worksheetId = parseInt(String(req.query.worksheet ?? '0'), 10);
    if (worksheetId <= 0) {
      const first = q.getFirstWorksheetId(db, userId);
      if (!first) {
        jsonError(res, 'No worksheets found.', 404);
        return;
      }
      worksheetId = first;
    }
    const data = q.getWorksheetData(db, worksheetId, userId);
    if (!data) {
      jsonError(res, 'Worksheet not found.', 404);
      return;
    }
    jsonResponse(res)({
      worksheet: data.worksheet,
      columns: data.columns,
      rows: data.rows,
    });
  } finally {
    db.close();
  }
}

export async function handleUpdate(req: Request, res: Response): Promise<void> {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const body = req.body as {
    row_id?: number;
    column_id?: number;
    value?: string;
  };
  const rowId = parseInt(String(body?.row_id ?? 0), 10);
  const columnId = parseInt(String(body?.column_id ?? 0), 10);
  const value = String(body?.value ?? '').trim();
  if (rowId <= 0 || columnId <= 0) {
    jsonError(res, 'Invalid row_id or column_id.');
    return;
  }
  const db = await getDbOrFail(res);
  if (!db) return;
  try {
    const col = q.getColumnById(db, columnId, userId);
    if (!col) {
      jsonError(res, 'Column not found or access denied.');
      return;
    }
    const isHelminth = col.name === 'Helminth';
    const current = q.getCellValue(db, rowId, columnId, userId);
    if (current === value) {
      jsonResponse(res)({ success: true, value });
      return;
    }
    if (isHelminth) {
      if (!isHelminthValue(value)) {
        jsonError(res, 'Invalid value for Helminth.');
        return;
      }
    } else {
      if (!ALLOWED_UPDATE_VALUES.includes(value)) {
        jsonError(res, 'Invalid status value.');
        return;
      }
      if (current === 'Unavailable') {
        jsonError(res, 'Cannot modify unavailable items.');
        return;
      }
    }
    const changes = q.updateCell(db, rowId, columnId, value, userId);
    if (changes <= 0) {
      jsonError(res, 'Update failed: row or column not updated.', 404);
      return;
    }
    jsonResponse(res)({ success: true, value });
  } catch (e) {
    jsonError(res, e instanceof Error ? e.message : 'Failed to update cell.');
  } finally {
    db.close();
  }
}

export async function handleAddRow(req: Request, res: Response): Promise<void> {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const body = req.body as {
    worksheet_id?: number;
    item_name?: string;
    values?: Record<string, string>;
  };
  const worksheetId = parseInt(String(body?.worksheet_id ?? 0), 10);
  const itemName = String(body?.item_name ?? '').trim();
  const valuesRaw = (body?.values ?? {}) as Record<string, string>;
  if (worksheetId <= 0) {
    jsonError(res, 'Invalid worksheet_id.');
    return;
  }
  if (!itemName) {
    jsonError(res, 'Item name is required.');
    return;
  }
  const db = await getDbOrFail(res);
  if (!db) return;
  try {
    const columns = q.getWorksheetColumns(db, worksheetId, userId);
    if (columns.length === 0) {
      res.status(403).json({ error: 'Worksheet not found or access denied.' });
      return;
    }
    const { valid: values, invalid } = validateColumnValues(valuesRaw, columns);
    if (invalid.length > 0) {
      res.status(400).json({
        error: 'Invalid column/value(s).',
        invalid,
      });
      return;
    }
    const rowId = q.addRow(db, worksheetId, userId, itemName, values);
    jsonResponse(res)({ success: true, row_id: rowId });
  } finally {
    db.close();
  }
}

export async function handleEditRow(
  req: Request,
  res: Response,
): Promise<void> {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const body = req.body as {
    row_id?: number;
    item_name?: string;
    values?: Record<string, string>;
  };
  const rowId = parseInt(String(body?.row_id ?? 0), 10);
  const itemName =
    body?.item_name != null ? String(body.item_name).trim() : null;
  const valuesRaw = (body?.values ?? {}) as Record<string, string>;
  if (rowId <= 0) {
    jsonError(res, 'Invalid row_id.');
    return;
  }
  const db = await getDbOrFail(res);
  if (!db) return;
  try {
    const worksheetId = q.getRowWorksheetId(db, rowId, userId);
    if (worksheetId === null) {
      jsonError(res, 'Row not found.', 404);
      return;
    }
    const columns = q.getWorksheetColumns(db, worksheetId, userId);
    const { valid: values, invalid } = validateColumnValues(valuesRaw, columns);
    if (invalid.length > 0) {
      res.status(400).json({
        error: 'Invalid column/value(s).',
        invalid,
      });
      return;
    }
    const ok = q.editRow(db, rowId, userId, itemName, values);
    if (!ok) {
      jsonError(res, 'Row not found.', 404);
      return;
    }
    jsonResponse(res)({ success: true });
  } finally {
    db.close();
  }
}

export async function handleDeleteRow(
  req: Request,
  res: Response,
): Promise<void> {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const body = req.body as { row_id?: number };
  const rowId = parseInt(String(body?.row_id ?? 0), 10);
  if (rowId <= 0) {
    jsonError(res, 'Invalid row_id.');
    return;
  }
  const db = await getDbOrFail(res);
  if (!db) return;
  try {
    const ok = q.deleteRow(db, rowId, userId);
    if (!ok) {
      jsonError(res, 'Row not found.', 404);
      return;
    }
    jsonResponse(res)({ success: true });
  } finally {
    db.close();
  }
}

export async function handleAdminUpdate(
  req: Request,
  res: Response,
): Promise<void> {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  if (!isAdmin(req.session as Parameters<typeof isAdmin>[0])) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const body = req.body as {
    row_id?: number;
    column_id?: number;
    value?: string;
  };
  const rowId = parseInt(String(body?.row_id ?? 0), 10);
  const columnId = parseInt(String(body?.column_id ?? 0), 10);
  const value = String(body?.value ?? '').trim();
  if (rowId <= 0 || columnId <= 0) {
    jsonError(res, 'Invalid row_id or column_id.');
    return;
  }
  const db = await getDbOrFail(res);
  if (!db) return;
  try {
    const result = q.adminUpdateCell(db, rowId, columnId, value, userId);
    if (result <= 0) {
      jsonError(res, 'Row or column not updated.', 404);
      return;
    }
    jsonResponse(res)({ success: true, value });
  } catch (e) {
    jsonError(res, e instanceof Error ? e.message : 'Invalid status value.');
  } finally {
    db.close();
  }
}
