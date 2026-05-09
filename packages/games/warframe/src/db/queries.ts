import Database from 'better-sqlite3';

import { resolveAdvancedRowRelevance } from '../advancedRules.js';
import { isHelminthValue, isValidStatus } from '../config.js';
import { normalizeDisplayName } from '../displayName.js';
import {
  isHelminthNonSubsumableItemName,
  isValidHelminthCellValue,
} from '../helminthExceptions.js';

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
  market_href?: string | null;
  market_href_prime?: string | null;
  market_href_normal?: string | null;
  advanced_progress?: {
    normal: AdvancedVariantProgressState;
    prime: AdvancedVariantProgressState;
  };
  advanced_relevance?: {
    normal: AdvancedVariantRelevanceState;
    prime: AdvancedVariantRelevanceState;
    has_prime_variant: boolean;
  };
}

export interface WorksheetData {
  worksheet: Worksheet;
  columns: Column[];
  rows: DataRow[];
}

export interface WorksheetRowRecord {
  id: number;
  item_name: string;
  display_order: number;
  market_href?: string | null;
  market_href_prime?: string | null;
}

const HELMINTH_COLUMN_NAME = 'Helminth';
const WARFRAMES_WORKSHEET_NAME = 'Warframes';
const VALENCE_COMPLETE_THRESHOLD = 58;

type AdvancedProgressRow = {
  row_id: number;
  level: number;
  level_prime: number | null;
  valence_percent: number | null;
  valence_percent_prime: number | null;
  has_element: number;
  has_element_prime: number | null;
  has_orokin: number;
  has_orokin_prime: number | null;
  has_arcane: number;
  has_arcane_prime: number | null;
  has_exilus: number;
  has_exilus_prime: number | null;
};

export type AdvancedVariantProgressState = {
  level: number;
  valence_percent: number | null;
  has_element: boolean;
  has_orokin: boolean;
  has_arcane: boolean;
  has_exilus: boolean;
};

export type AdvancedVariantRelevanceState = {
  max_level: number;
  valence: boolean;
  element: boolean;
  orokin: boolean;
  arcane: boolean;
  exilus: boolean;
};

export type AdvancedProgressState = {
  normal: AdvancedVariantProgressState;
  prime: AdvancedVariantProgressState;
  relevance: {
    normal: AdvancedVariantRelevanceState;
    prime: AdvancedVariantRelevanceState;
    has_prime_variant: boolean;
  };
};

export type AdvancedProgressPatch = Partial<{
  level: number;
  level_prime: number;
  valence_percent: number | null;
  valence_percent_prime: number | null;
  has_element: boolean;
  has_element_prime: boolean;
  has_orokin: boolean;
  has_orokin_prime: boolean;
  has_arcane: boolean;
  has_arcane_prime: boolean;
  has_exilus: boolean;
  has_exilus_prime: boolean;
}>;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeValence(value: number): number {
  const clamped = clamp(Math.trunc(value), 25, 60);
  return clamped >= VALENCE_COMPLETE_THRESHOLD ? 60 : clamped;
}

function rowHasVariant(
  rowValues: Record<number, string>,
  columns: { id: number; name: string }[],
  prime: boolean,
): boolean {
  const candidateColumns = columns.filter((column) => {
    if (column.name === HELMINTH_COLUMN_NAME) return false;
    return prime ? /prime/i.test(column.name) : !/prime/i.test(column.name);
  });
  if (candidateColumns.length === 0) return !prime;
  return candidateColumns.some((column) => (rowValues[column.id] ?? '') !== 'Unavailable');
}

export function resolveAdvancedProgressState(
  worksheetName: string,
  itemName: string,
  hasPrimeVariant: boolean,
  current?: AdvancedProgressRow | null,
  patch?: AdvancedProgressPatch,
): AdvancedProgressState {
  const normalRelevanceRaw = resolveAdvancedRowRelevance(worksheetName, itemName);
  const primeRelevanceRaw = resolveAdvancedRowRelevance(worksheetName, `${itemName} Prime`);
  const normalizeRelevance = (
    raw: ReturnType<typeof resolveAdvancedRowRelevance>,
    available: boolean,
  ): AdvancedVariantRelevanceState => ({
    max_level: raw.maxLevel,
    valence: available && raw.valence,
    element: available && raw.element,
    orokin: available && raw.orokin,
    arcane: available && raw.arcane,
    exilus: available && raw.exilus,
  });
  const normalRelevance = normalizeRelevance(normalRelevanceRaw, true);
  const primeRelevance = normalizeRelevance(primeRelevanceRaw, hasPrimeVariant);

  const normalizeVariantState = (
    relevance: AdvancedVariantRelevanceState,
    source: {
      level: number | null | undefined;
      valence_percent: number | null | undefined;
      has_element: number | null | undefined;
      has_orokin: number | null | undefined;
      has_arcane: number | null | undefined;
      has_exilus: number | null | undefined;
    },
    variantPatch: Partial<AdvancedProgressPatch>,
    autoPrimeFlags = false,
    autoArcane = false,
  ): AdvancedVariantProgressState => {
    let level = clamp(source.level ?? 0, 0, relevance.max_level);
    let valencePercent =
      relevance.valence && source.valence_percent !== null && source.valence_percent !== undefined
        ? normalizeValence(source.valence_percent)
        : relevance.valence
          ? 25
          : null;
    let hasElement = source.has_element === 1;
    let hasOrokin = source.has_orokin === 1;
    let hasArcane = source.has_arcane === 1;
    let hasExilus = source.has_exilus === 1;

    if (typeof variantPatch.level === 'number' && Number.isFinite(variantPatch.level)) {
      level = clamp(Math.trunc(variantPatch.level), 0, relevance.max_level);
    }
    if (variantPatch.valence_percent !== undefined) {
      if (variantPatch.valence_percent === null || !relevance.valence) {
        valencePercent = null;
      } else if (typeof variantPatch.valence_percent === 'number') {
        valencePercent = normalizeValence(variantPatch.valence_percent);
      }
    }
    if (typeof variantPatch.has_element === 'boolean') hasElement = variantPatch.has_element;
    if (typeof variantPatch.has_orokin === 'boolean') hasOrokin = variantPatch.has_orokin;
    if (typeof variantPatch.has_arcane === 'boolean') hasArcane = variantPatch.has_arcane;
    if (typeof variantPatch.has_exilus === 'boolean') hasExilus = variantPatch.has_exilus;

    if (!relevance.element) hasElement = false;
    if (!relevance.orokin) hasOrokin = false;
    if (!relevance.arcane) hasArcane = false;
    if (!relevance.exilus) hasExilus = false;
    if (!relevance.valence) valencePercent = null;
    if (autoPrimeFlags) {
      hasOrokin = true;
    }
    if (autoArcane && relevance.arcane) {
      hasArcane = true;
    }

    return {
      level,
      valence_percent: valencePercent,
      has_element: hasElement,
      has_orokin: hasOrokin,
      has_arcane: hasArcane,
      has_exilus: hasExilus,
    };
  };

  const normal = normalizeVariantState(
    normalRelevance,
    {
      level: current?.level,
      valence_percent: current?.valence_percent,
      has_element: current?.has_element,
      has_orokin: current?.has_orokin,
      has_arcane: current?.has_arcane,
      has_exilus: current?.has_exilus,
    },
    {
      level: patch?.level,
      valence_percent: patch?.valence_percent,
      has_element: patch?.has_element,
      has_orokin: patch?.has_orokin,
      has_arcane: patch?.has_arcane,
      has_exilus: patch?.has_exilus,
    },
    normalRelevanceRaw.primeAutoElementOrokin,
    normalRelevanceRaw.autoArcane,
  );
  const prime = normalizeVariantState(
    primeRelevance,
    {
      level: current?.level_prime,
      valence_percent: current?.valence_percent_prime,
      has_element: current?.has_element_prime,
      has_orokin: current?.has_orokin_prime,
      has_arcane: current?.has_arcane_prime,
      has_exilus: current?.has_exilus_prime,
    },
    {
      level: patch?.level_prime,
      valence_percent: patch?.valence_percent_prime,
      has_element: patch?.has_element_prime,
      has_orokin: patch?.has_orokin_prime,
      has_arcane: patch?.has_arcane_prime,
      has_exilus: patch?.has_exilus_prime,
    },
    primeRelevanceRaw.primeAutoElementOrokin,
    primeRelevanceRaw.autoArcane,
  );

  return {
    normal,
    prime,
    relevance: {
      normal: normalRelevance,
      prime: primeRelevance,
      has_prime_variant: hasPrimeVariant,
    },
  };
}

export function getWorksheets(db: Database.Database, userId: number): Worksheet[] {
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
    .prepare('SELECT id, name, display_order FROM worksheets WHERE id = ? AND user_id = ?')
    .get(id, userId) as (Worksheet & { display_order: number }) | undefined;
}

export function getWorksheetByName(
  db: Database.Database,
  userId: number,
  worksheetName: string,
): (Worksheet & { display_order: number }) | undefined {
  return db
    .prepare('SELECT id, name, display_order FROM worksheets WHERE user_id = ? AND name = ?')
    .get(userId, worksheetName) as
    | (Worksheet & {
        display_order: number;
      })
    | undefined;
}

export function getFirstWorksheetId(db: Database.Database, userId: number): number | null {
  const row = db
    .prepare('SELECT id FROM worksheets WHERE user_id = ? ORDER BY display_order LIMIT 1')
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
    .get(columnId, userId) as { id: number; name: string; worksheet_id: number } | undefined;
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

export function getRowItemName(
  db: Database.Database,
  rowId: number,
  userId: number,
): string | null {
  const row = db
    .prepare(
      `SELECT r.item_name FROM rows r
       JOIN worksheets w ON r.worksheet_id = w.id
       WHERE r.id = ? AND w.user_id = ?`,
    )
    .get(rowId, userId) as { item_name: string } | undefined;
  return row?.item_name ?? null;
}

export function getWorksheetRows(
  db: Database.Database,
  worksheetId: number,
  userId: number,
): WorksheetRowRecord[] {
  return db
    .prepare(
      `SELECT r.id, r.item_name, r.display_order, r.market_href, r.market_href_prime
       FROM rows r
       JOIN worksheets w ON r.worksheet_id = w.id
       WHERE w.id = ? AND w.user_id = ?
       ORDER BY r.display_order`,
    )
    .all(worksheetId, userId) as WorksheetRowRecord[];
}

export function getWorksheetUserIds(db: Database.Database): number[] {
  return (
    db.prepare('SELECT DISTINCT user_id FROM worksheets ORDER BY user_id').all() as {
      user_id: number;
    }[]
  ).map((row) => row.user_id);
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

  const selExisting = db.prepare('SELECT id FROM columns WHERE worksheet_id = ? AND name = ?');
  const selMaxOrder = db.prepare(
    'SELECT MAX(display_order) as max_order FROM columns WHERE worksheet_id = ?',
  );
  const insertColumn = db.prepare(
    'INSERT INTO columns (worksheet_id, name, display_order) VALUES (?, ?, ?)',
  );
  const selRows = db.prepare('SELECT id, item_name FROM rows WHERE worksheet_id = ?');
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
    const colResult = insertColumn.run(worksheetId, HELMINTH_COLUMN_NAME, displayOrder);
    const columnId = Number(colResult.lastInsertRowid);
    const rows = selRows.all(worksheetId) as { id: number; item_name: string }[];
    for (const r of rows) {
      const initial = isHelminthNonSubsumableItemName(r.item_name) ? 'Unavailable' : '';
      insertCell.run(r.id, columnId, initial);
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
      `SELECT r.id, r.item_name as name, r.display_order, r.market_href, r.market_href_prime
       FROM rows r
       JOIN worksheets w ON r.worksheet_id = w.id
       WHERE w.id = ? AND w.user_id = ?
       ORDER BY r.display_order`,
    )
    .all(worksheetId, userId) as {
    id: number;
    name: string;
    display_order: number;
    market_href: string | null;
    market_href_prime: string | null;
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
    market_href: r.market_href,
    market_href_prime: r.market_href_prime,
    market_href_normal: r.market_href,
    values: columns.reduce<Record<number, string>>((acc, col) => {
      acc[col.id] = cellLookup[r.id]?.[col.id] ?? '';
      return acc;
    }, {}),
  }));

  const rowIds = dataRows.map((row) => row.id);
  const advancedRowsByRowId = new Map<number, AdvancedProgressRow>();
  if (rowIds.length > 0) {
    const placeholders = rowIds.map(() => '?').join(',');
    const advancedRows = db
      .prepare(
        `SELECT row_id, level, level_prime, valence_percent, valence_percent_prime, has_element, has_element_prime, has_orokin, has_orokin_prime, has_arcane, has_arcane_prime, has_exilus, has_exilus_prime
         FROM row_advanced_progress
         WHERE row_id IN (${placeholders})`,
      )
      .all(...rowIds) as AdvancedProgressRow[];
    for (const row of advancedRows) {
      advancedRowsByRowId.set(row.row_id, row);
    }
  }

  for (const row of dataRows) {
    const hasPrimeVariant = rowHasVariant(row.values, columns, true);
    const state = resolveAdvancedProgressState(
      worksheet.name,
      row.name,
      hasPrimeVariant,
      advancedRowsByRowId.get(row.id),
    );
    row.advanced_progress = {
      normal: state.normal,
      prime: state.prime,
    };
    row.advanced_relevance = state.relevance;
  }

  dataRows.sort((a, b) =>
    normalizeDisplayName(a.name).localeCompare(normalizeDisplayName(b.name), undefined, {
      sensitivity: 'base',
    }),
  );

  return {
    worksheet,
    columns,
    rows: dataRows,
  };
}

export function getRowAdvancedProgress(
  db: Database.Database,
  rowId: number,
  userId: number,
): AdvancedProgressState | null {
  const row = db
    .prepare(
      `SELECT r.id, r.item_name, w.name as worksheet_name
       FROM rows r
       JOIN worksheets w ON r.worksheet_id = w.id
       WHERE r.id = ? AND w.user_id = ?`,
    )
    .get(rowId, userId) as { id: number; item_name: string; worksheet_name: string } | undefined;
  if (!row) return null;
  const current = db
    .prepare(
      `SELECT row_id, level, level_prime, valence_percent, valence_percent_prime, has_element, has_element_prime, has_orokin, has_orokin_prime, has_arcane, has_arcane_prime, has_exilus, has_exilus_prime
       FROM row_advanced_progress
       WHERE row_id = ?`,
    )
    .get(rowId) as AdvancedProgressRow | undefined;
  const columns = getWorksheetColumns(db, getRowWorksheetId(db, rowId, userId) ?? 0, userId);
  const rowValues = columns.reduce<Record<number, string>>((acc, column) => {
    acc[column.id] = getCellValue(db, rowId, column.id, userId) ?? '';
    return acc;
  }, {});
  const hasPrimeVariant = rowHasVariant(rowValues, columns, true);
  return resolveAdvancedProgressState(row.worksheet_name, row.item_name, hasPrimeVariant, current);
}

export function updateRowAdvancedProgress(
  db: Database.Database,
  rowId: number,
  userId: number,
  patch: AdvancedProgressPatch,
): AdvancedProgressState {
  const row = db
    .prepare(
      `SELECT r.id, r.item_name, w.name as worksheet_name
       FROM rows r
       JOIN worksheets w ON r.worksheet_id = w.id
       WHERE r.id = ? AND w.user_id = ?`,
    )
    .get(rowId, userId) as { id: number; item_name: string; worksheet_name: string } | undefined;
  if (!row) {
    throw new Error('Row not found');
  }
  const current = db
    .prepare(
      `SELECT row_id, level, level_prime, valence_percent, valence_percent_prime, has_element, has_element_prime, has_orokin, has_orokin_prime, has_arcane, has_arcane_prime, has_exilus, has_exilus_prime
       FROM row_advanced_progress
       WHERE row_id = ?`,
    )
    .get(rowId) as AdvancedProgressRow | undefined;
  const worksheetId = getRowWorksheetId(db, rowId, userId);
  const columns = worksheetId === null ? [] : getWorksheetColumns(db, worksheetId, userId);
  const rowValues = columns.reduce<Record<number, string>>((acc, column) => {
    acc[column.id] = getCellValue(db, rowId, column.id, userId) ?? '';
    return acc;
  }, {});
  const hasPrimeVariant = rowHasVariant(rowValues, columns, true);
  const next = resolveAdvancedProgressState(
    row.worksheet_name,
    row.item_name,
    hasPrimeVariant,
    current,
    patch,
  );
  db.prepare(
    `INSERT INTO row_advanced_progress (
      row_id, level, level_prime, valence_percent, valence_percent_prime, has_element, has_element_prime, has_orokin, has_orokin_prime, has_arcane, has_arcane_prime, has_exilus, has_exilus_prime, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(row_id) DO UPDATE SET
      level = excluded.level,
      level_prime = excluded.level_prime,
      valence_percent = excluded.valence_percent,
      valence_percent_prime = excluded.valence_percent_prime,
      has_element = excluded.has_element,
      has_element_prime = excluded.has_element_prime,
      has_orokin = excluded.has_orokin,
      has_orokin_prime = excluded.has_orokin_prime,
      has_arcane = excluded.has_arcane,
      has_arcane_prime = excluded.has_arcane_prime,
      has_exilus = excluded.has_exilus,
      has_exilus_prime = excluded.has_exilus_prime,
      updated_at = datetime('now')`,
  ).run(
    rowId,
    next.normal.level,
    next.prime.level,
    next.normal.valence_percent,
    next.prime.valence_percent,
    next.normal.has_element ? 1 : 0,
    next.prime.has_element ? 1 : 0,
    next.normal.has_orokin ? 1 : 0,
    next.prime.has_orokin ? 1 : 0,
    next.normal.has_arcane ? 1 : 0,
    next.prime.has_arcane ? 1 : 0,
    next.normal.has_exilus ? 1 : 0,
    next.prime.has_exilus ? 1 : 0,
  );
  return next;
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
      `SELECT r.id, r.worksheet_id, r.item_name FROM rows r
       JOIN worksheets w ON r.worksheet_id = w.id
       WHERE r.id = ? AND w.user_id = ?`,
    )
    .get(rowId, userId) as { id: number; worksheet_id: number; item_name: string } | undefined;
  if (!row) throw new Error('Row not found');
  const col = db
    .prepare(
      `SELECT c.id, c.name FROM columns c
       JOIN worksheets w ON c.worksheet_id = w.id
       WHERE c.id = ? AND w.id = ? AND w.user_id = ?`,
    )
    .get(columnId, row.worksheet_id, userId) as { id: number; name: string } | undefined;
  if (!col) {
    throw new Error('Column not found or does not belong to worksheet');
  }
  const columnName = col.name ?? '';
  const sanitizedValue =
    columnName === HELMINTH_COLUMN_NAME
      ? isValidHelminthCellValue(row.item_name, value)
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
      .prepare('SELECT MAX(display_order) as max_order FROM rows WHERE worksheet_id = ?')
      .get(worksheetId) as { max_order: number | null };
    const displayOrder = (maxOrder?.max_order ?? -1) + 1;
    const result = db
      .prepare('INSERT INTO rows (worksheet_id, item_name, display_order) VALUES (?, ?, ?)')
      .run(worksheetId, itemName, displayOrder);
    const rowId = result.lastInsertRowid as number;
    for (const col of worksheetColumns) {
      let v = values[col.id] ?? '';
      if (col.name === HELMINTH_COLUMN_NAME) {
        if (isHelminthNonSubsumableItemName(itemName)) {
          v = 'Unavailable';
        } else if (!isHelminthValue(v)) {
          v = '';
        }
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
      `SELECT r.id, r.worksheet_id, r.item_name FROM rows r
       JOIN worksheets w ON r.worksheet_id = w.id
       WHERE r.id = ? AND w.user_id = ?`,
    )
    .get(rowId, userId) as { id: number; worksheet_id: number; item_name: string } | undefined;
  if (!row) return false;

  const resolvedItemName =
    itemName !== null && itemName.trim() !== '' ? itemName.trim() : (row.item_name ?? '');

  const columnIds = Object.keys(values)
    .map((k) => parseInt(k, 10))
    .filter((id) => !Number.isNaN(id));

  const columnMap = new Map<number, { id: number; name: string; worksheet_id: number }>();
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
      db.prepare('UPDATE rows SET item_name = ? WHERE id = ?').run(itemName.trim(), rowId);
    }
    for (const [colIdStr, value] of Object.entries(values)) {
      const colId = parseInt(colIdStr, 10);
      const col = columnMap.get(colId);
      if (!col) continue;
      const v =
        col.name === HELMINTH_COLUMN_NAME
          ? isValidHelminthCellValue(resolvedItemName, value)
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
  } catch (err) {
    console.error('[warframe db] editRow transaction failed', err);
    return false;
  }
}

export function deleteRow(db: Database.Database, rowId: number, userId: number): boolean {
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
  } catch (err) {
    console.error('[warframe db] deleteRow transaction failed', err);
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
      `SELECT r.id, r.worksheet_id, r.item_name FROM rows r
       JOIN worksheets w ON r.worksheet_id = w.id
       WHERE r.id = ? AND w.user_id = ?`,
    )
    .get(rowId, userId) as { id: number; worksheet_id: number; item_name: string } | undefined;
  if (!row) throw new Error('Row not found');
  const col = getColumnById(db, columnId, userId);
  if (!col) throw new Error('Column not found');
  if (col.worksheet_id !== row.worksheet_id) {
    // prettier-ignore
    throw new Error('Column does not belong to row\'s worksheet');
  }
  const valid =
    col.name === HELMINTH_COLUMN_NAME
      ? isValidHelminthCellValue(row.item_name, value)
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
    .prepare('INSERT INTO worksheets (user_id, name, display_order) VALUES (?, ?, ?)')
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
    .prepare('INSERT INTO columns (worksheet_id, name, display_order) VALUES (?, ?, ?)')
    .run(worksheetId, name, displayOrder);
  return Number(r.lastInsertRowid);
}

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
    .prepare('INSERT INTO rows (worksheet_id, item_name, display_order) VALUES (?, ?, ?)')
    .run(worksheetId, itemName, displayOrder);
  return Number(r.lastInsertRowid);
}

export function addRowWithEmptyValues(
  db: Database.Database,
  worksheetId: number,
  userId: number,
  itemName: string,
): number {
  return addRow(db, worksheetId, userId, itemName, {});
}

export function ensureHelminthNonSubsumableCells(
  db: Database.Database,
  worksheetId: number,
  userId: number,
): void {
  const ws = getWorksheetById(db, worksheetId, userId);
  if (!ws || ws.name !== WARFRAMES_WORKSHEET_NAME) return;
  const columns = getWorksheetColumns(db, worksheetId, userId);
  const helminthCol = columns.find((c) => c.name === HELMINTH_COLUMN_NAME);
  if (!helminthCol) return;
  const rows = getWorksheetRows(db, worksheetId, userId);
  const upsert = db.prepare(
    `INSERT INTO cell_values (row_id, column_id, value)
     VALUES (?, ?, ?)
     ON CONFLICT(row_id, column_id) DO UPDATE SET value = excluded.value`,
  );
  const tx = db.transaction(() => {
    for (const r of rows) {
      if (!isHelminthNonSubsumableItemName(r.item_name)) continue;
      const current = getCellValue(db, r.id, helminthCol.id, userId) ?? '';
      if (current === 'Unavailable') continue;
      upsert.run(r.id, helminthCol.id, 'Unavailable');
    }
  });
  tx();
}

export function setRowUnavailable(db: Database.Database, rowId: number, userId: number): boolean {
  const worksheetId = getRowWorksheetId(db, rowId, userId);
  if (worksheetId === null) return false;
  const columns = getWorksheetColumns(db, worksheetId, userId);
  const upsert = db.prepare(
    `INSERT INTO cell_values (row_id, column_id, value)
     VALUES (?, ?, ?)
     ON CONFLICT(row_id, column_id) DO UPDATE SET value = excluded.value`,
  );
  const tx = db.transaction(() => {
    for (const column of columns) {
      const value = column.name === HELMINTH_COLUMN_NAME ? '' : 'Unavailable';
      upsert.run(rowId, column.id, value);
    }
  });
  tx();
  return true;
}
