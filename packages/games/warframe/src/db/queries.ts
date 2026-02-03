import Database from 'better-sqlite3';

import { isHelminthValue, isValidStatus } from '../config.js';

export interface Worksheet {
  id: number;
  name: string;
  display_order?: number;
}

export interface Column {
  id: number;
  name: string;
  worksheet_id?: number;
  display_order?: number;
}

export interface DataRow {
  id: number;
  name: string;
  values: Record<number, string>;
}

export interface WorksheetData {
  worksheet: Worksheet;
  columns: Column[];
  rows: DataRow[];
}

const HELMINTH_COLUMN_NAME = 'Helminth';
const WARFRAMES_WORKSHEET_NAME = 'Warframes';

export function getWorksheets(
  db: Database.Database,
  userId: number,
): Worksheet[] {
  return db
    .prepare(
      'SELECT id, name, display_order FROM worksheets WHERE user_id = ? ORDER BY display_order',
    )
    .all(userId) as Worksheet[];
}

export function getWorksheetById(
  db: Database.Database,
  id: number,
  userId: number,
): (Worksheet & { display_order: number }) | undefined {
  return db
    .prepare(
      'SELECT id, name, display_order FROM worksheets WHERE id = ? AND user_id = ?',
    )
    .get(id, userId) as (Worksheet & { display_order: number }) | undefined;
}

export function getFirstWorksheetId(
  db: Database.Database,
  userId: number,
): number | null {
  const row = db
    .prepare(
      'SELECT id FROM worksheets WHERE user_id = ? ORDER BY display_order LIMIT 1',
    )
    .get(userId) as { id: number } | undefined;
  return row?.id ?? null;
}

export function getColumnById(
  db: Database.Database,
  columnId: number,
  userId: number,
): { id: number; name: string; worksheet_id: number } | undefined {
  return db
    .prepare(
      `SELECT c.id, c.name, c.worksheet_id FROM columns c
       JOIN worksheets w ON c.worksheet_id = w.id
       WHERE c.id = ? AND w.user_id = ?`,
    )
    .get(columnId, userId) as
    | { id: number; name: string; worksheet_id: number }
    | undefined;
}

export function getWorksheetColumns(
  db: Database.Database,
  worksheetId: number,
  userId: number,
): { id: number; name: string }[] {
  return db
    .prepare(
      `SELECT c.id, c.name FROM columns c
       JOIN worksheets w ON c.worksheet_id = w.id
       WHERE w.id = ? AND w.user_id = ?
       ORDER BY c.display_order`,
    )
    .all(worksheetId, userId) as { id: number; name: string }[];
}

export function getRowWorksheetId(
  db: Database.Database,
  rowId: number,
  userId: number,
): number | null {
  const row = db
    .prepare(
      `SELECT r.worksheet_id FROM rows r
       JOIN worksheets w ON r.worksheet_id = w.id
       WHERE r.id = ? AND w.user_id = ?`,
    )
    .get(rowId, userId) as { worksheet_id: number } | undefined;
  return row?.worksheet_id ?? null;
}

export function ensureHelminthColumn(
  db: Database.Database,
  worksheetId: number,
  worksheetName: string,
  userId: number,
): void {
  if (worksheetName !== WARFRAMES_WORKSHEET_NAME) return;
  const ws = getWorksheetById(db, worksheetId, userId);
  if (!ws) return;

  const selExisting = db.prepare(
    'SELECT id FROM columns WHERE worksheet_id = ? AND name = ?',
  );
  const selMaxOrder = db.prepare(
    'SELECT MAX(display_order) as max_order FROM columns WHERE worksheet_id = ?',
  );
  const insertColumn = db.prepare(
    'INSERT INTO columns (worksheet_id, name, display_order) VALUES (?, ?, ?)',
  );
  const selRows = db.prepare('SELECT id FROM rows WHERE worksheet_id = ?');
  const insertCell = db.prepare(
    'INSERT INTO cell_values (row_id, column_id, value) VALUES (?, ?, ?)',
  );

  db.transaction(() => {
    const existing = selExisting.get(worksheetId, HELMINTH_COLUMN_NAME);
    if (existing) return;

    const maxOrder = selMaxOrder.get(worksheetId) as {
      max_order: number | null;
    };
    const displayOrder = (maxOrder?.max_order ?? -1) + 1;
    const colResult = insertColumn.run(
      worksheetId,
      HELMINTH_COLUMN_NAME,
      displayOrder,
    );
    const columnId = Number(colResult.lastInsertRowid);
    const rows = selRows.all(worksheetId) as { id: number }[];
    for (const r of rows) {
      insertCell.run(r.id, columnId, '');
    }
  })();
}

export function getWorksheetData(
  db: Database.Database,
  worksheetId: number,
  userId: number,
): WorksheetData | null {
  const worksheet = getWorksheetById(db, worksheetId, userId);
  if (!worksheet) return null;

  const columns = getWorksheetColumns(db, worksheetId, userId);
  const rows = db
    .prepare(
      `SELECT r.id, r.item_name as name, r.display_order
       FROM rows r
       JOIN worksheets w ON r.worksheet_id = w.id
       WHERE w.id = ? AND w.user_id = ?
       ORDER BY r.display_order`,
    )
    .all(worksheetId, userId) as {
    id: number;
    name: string;
    display_order: number;
  }[];

  const cellRows = db
    .prepare(
      `SELECT cv.row_id, cv.column_id, cv.value
       FROM cell_values cv
       JOIN rows r ON cv.row_id = r.id
       JOIN worksheets w ON r.worksheet_id = w.id
       WHERE w.id = ? AND w.user_id = ?`,
    )
    .all(worksheetId, userId) as {
    row_id: number;
    column_id: number;
    value: string;
  }[];

  const cellLookup: Record<number, Record<number, string>> = {};
  for (const c of cellRows) {
    if (!cellLookup[c.row_id]) cellLookup[c.row_id] = {};
    cellLookup[c.row_id][c.column_id] = c.value;
  }

  const dataRows: DataRow[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    values: columns.reduce<Record<number, string>>((acc, col) => {
      acc[col.id] = cellLookup[r.id]?.[col.id] ?? '';
      return acc;
    }, {}),
  }));

  return {
    worksheet,
    columns,
    rows: dataRows,
  };
}

export function updateCell(
  db: Database.Database,
  rowId: number,
  columnId: number,
  value: string,
  userId: number,
): number {
  const row = db
    .prepare(
      'SELECT r.id, r.worksheet_id FROM rows r JOIN worksheets w ON r.worksheet_id = w.id WHERE r.id = ? AND w.user_id = ?',
    )
    .get(rowId, userId) as { id: number; worksheet_id: number } | undefined;
  if (!row) throw new Error('Row not found');
  const col = db
    .prepare(
      `SELECT c.id, c.name FROM columns c
       JOIN worksheets w ON c.worksheet_id = w.id
       WHERE c.id = ? AND w.id = ? AND w.user_id = ?`,
    )
    .get(columnId, row.worksheet_id, userId) as
    | { id: number; name: string }
    | undefined;
  if (!col) {
    throw new Error('Column not found or does not belong to worksheet');
  }
  const columnName = col.name ?? '';
  const sanitizedValue =
    columnName === HELMINTH_COLUMN_NAME
      ? isHelminthValue(value)
        ? value
        : (() => {
            throw new Error('Invalid value for Helminth column');
          })()
      : isValidStatus(value)
        ? value
        : (() => {
            throw new Error('Invalid status value');
          })();
  const result = db
    .prepare(
      `INSERT INTO cell_values (row_id, column_id, value)
     VALUES (?, ?, ?)
     ON CONFLICT(row_id, column_id) DO UPDATE SET value = excluded.value`,
    )
    .run(rowId, columnId, sanitizedValue) as Database.RunResult;
  return result.changes;
}

export function getCellValue(
  db: Database.Database,
  rowId: number,
  columnId: number,
  userId: number,
): string | undefined {
  const row = db
    .prepare(
      `SELECT cv.value FROM cell_values cv
       JOIN rows r ON cv.row_id = r.id
       JOIN worksheets w ON r.worksheet_id = w.id
       WHERE cv.row_id = ? AND cv.column_id = ? AND w.user_id = ?`,
    )
    .get(rowId, columnId, userId) as { value: string } | undefined;
  return row?.value;
}

/**
 * Adds a row to a worksheet and initializes cell values for all columns.
 * Use this when creating a new row with known or default cell data.
 */
export function addRow(
  db: Database.Database,
  worksheetId: number,
  userId: number,
  itemName: string,
  values: Record<number, string>,
): number {
  const ws = getWorksheetById(db, worksheetId, userId);
  if (!ws) throw new Error('Worksheet not found');
  const worksheetColumns = getWorksheetColumns(db, worksheetId, userId);
  const insertCell = db.prepare(
    'INSERT INTO cell_values (row_id, column_id, value) VALUES (?, ?, ?)',
  );
  const transaction = db.transaction(() => {
    const maxOrder = db
      .prepare(
        'SELECT MAX(display_order) as max_order FROM rows WHERE worksheet_id = ?',
      )
      .get(worksheetId) as { max_order: number | null };
    const displayOrder = (maxOrder?.max_order ?? -1) + 1;
    const result = db
      .prepare(
        'INSERT INTO rows (worksheet_id, item_name, display_order) VALUES (?, ?, ?)',
      )
      .run(worksheetId, itemName, displayOrder);
    const rowId = result.lastInsertRowid as number;
    for (const col of worksheetColumns) {
      let v = values[col.id] ?? '';
      if (col.name === HELMINTH_COLUMN_NAME) {
        if (!isHelminthValue(v)) v = '';
      } else if (!isValidStatus(v)) {
        v = '';
      }
      insertCell.run(rowId, col.id, v);
    }
    return rowId;
  });
  return transaction();
}

export function editRow(
  db: Database.Database,
  rowId: number,
  userId: number,
  itemName: string | null,
  values: Record<number, string>,
): boolean {
  const row = db
    .prepare(
      'SELECT r.id, r.worksheet_id FROM rows r JOIN worksheets w ON r.worksheet_id = w.id WHERE r.id = ? AND w.user_id = ?',
    )
    .get(rowId, userId) as { id: number; worksheet_id: number } | undefined;
  if (!row) return false;

  const columnIds = Object.keys(values)
    .map((k) => parseInt(k, 10))
    .filter((id) => !Number.isNaN(id));

  const columnMap = new Map<
    number,
    { id: number; name: string; worksheet_id: number }
  >();
  if (columnIds.length > 0) {
    const placeholders = columnIds.map(() => '?').join(',');
    const columns = db
      .prepare(
        `SELECT c.id, c.name, c.worksheet_id FROM columns c
         JOIN worksheets w ON c.worksheet_id = w.id
         WHERE c.id IN (${placeholders}) AND w.user_id = ? AND c.worksheet_id = ?`,
      )
      .all(...columnIds, userId, row.worksheet_id) as {
      id: number;
      name: string;
      worksheet_id: number;
    }[];
    for (const col of columns) {
      columnMap.set(col.id, col);
    }
  }

  const upsert = db.prepare(`
    INSERT INTO cell_values (row_id, column_id, value)
    VALUES (?, ?, ?)
    ON CONFLICT(row_id, column_id) DO UPDATE SET value = excluded.value
  `);

  const transaction = db.transaction(() => {
    if (itemName !== null && itemName.trim() !== '') {
      db.prepare('UPDATE rows SET item_name = ? WHERE id = ?').run(
        itemName.trim(),
        rowId,
      );
    }
    for (const [colIdStr, value] of Object.entries(values)) {
      const colId = parseInt(colIdStr, 10);
      const col = columnMap.get(colId);
      if (!col) continue;
      const v =
        col.name === HELMINTH_COLUMN_NAME
          ? isHelminthValue(value)
            ? value
            : ''
          : isValidStatus(value)
            ? value
            : '';
      upsert.run(rowId, colId, v);
    }
  });

  try {
    transaction();
    return true;
  } catch {
    return false;
  }
}

export function deleteRow(
  db: Database.Database,
  rowId: number,
  userId: number,
): boolean {
  const row = db
    .prepare(
      'SELECT r.id FROM rows r JOIN worksheets w ON r.worksheet_id = w.id WHERE r.id = ? AND w.user_id = ?',
    )
    .get(rowId, userId);
  if (!row) return false;
  const transaction = db.transaction(() => {
    db.prepare('DELETE FROM cell_values WHERE row_id = ?').run(rowId);
    const result = db.prepare('DELETE FROM rows WHERE id = ?').run(rowId);
    if (result.changes === 0) throw new Error('Delete row failed');
  });
  try {
    transaction();
    return true;
  } catch {
    return false;
  }
}

export function adminUpdateCell(
  db: Database.Database,
  rowId: number,
  columnId: number,
  value: string,
  userId: number,
): number {
  const row = db
    .prepare(
      'SELECT r.id, r.worksheet_id FROM rows r JOIN worksheets w ON r.worksheet_id = w.id WHERE r.id = ? AND w.user_id = ?',
    )
    .get(rowId, userId) as { id: number; worksheet_id: number } | undefined;
  if (!row) throw new Error('Row not found');
  const col = getColumnById(db, columnId, userId);
  if (!col) throw new Error('Column not found');
  if (col.worksheet_id !== row.worksheet_id) {
    // prettier-ignore
    throw new Error('Column does not belong to row\'s worksheet');
  }
  const valid =
    col.name === HELMINTH_COLUMN_NAME
      ? isHelminthValue(value)
      : isValidStatus(value);
  if (!valid) throw new Error('Invalid status value');
  const result = db
    .prepare(
      `INSERT INTO cell_values (row_id, column_id, value)
     VALUES (?, ?, ?)
     ON CONFLICT(row_id, column_id) DO UPDATE SET value = excluded.value`,
    )
    .run(rowId, columnId, value) as Database.RunResult;
  return result.changes;
}

export function createWorksheet(
  db: Database.Database,
  userId: number,
  name: string,
  displayOrder: number,
): number {
  const r = db
    .prepare(
      'INSERT INTO worksheets (user_id, name, display_order) VALUES (?, ?, ?)',
    )
    .run(userId, name, displayOrder);
  return Number(r.lastInsertRowid);
}

export function addColumn(
  db: Database.Database,
  worksheetId: number,
  userId: number,
  name: string,
  displayOrder: number,
): number {
  const ws = getWorksheetById(db, worksheetId, userId);
  if (!ws) throw new Error('Worksheet not found');
  const r = db
    .prepare(
      'INSERT INTO columns (worksheet_id, name, display_order) VALUES (?, ?, ?)',
    )
    .run(worksheetId, name, displayOrder);
  return Number(r.lastInsertRowid);
}

/**
 * Inserts only a row record in the rows table. Does not create or populate
 * any cell_values. Use {@link addRow} when you need a row with initialized
 * cells for all worksheet columns.
 */
export function insertRowRecord(
  db: Database.Database,
  worksheetId: number,
  userId: number,
  itemName: string,
  displayOrder: number,
): number {
  const ws = getWorksheetById(db, worksheetId, userId);
  if (!ws) throw new Error('Worksheet not found');
  const r = db
    .prepare(
      'INSERT INTO rows (worksheet_id, item_name, display_order) VALUES (?, ?, ?)',
    )
    .run(worksheetId, itemName, displayOrder);
  return Number(r.lastInsertRowid);
}
