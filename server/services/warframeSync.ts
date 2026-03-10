import { warframeQueries as q } from '@corpus/game-warframe';
import Database from 'better-sqlite3';

import { PARAMETRIC_DB_PATH } from '../config.js';
import {
  isPrimeVariantName,
  normalizeDisplayName,
  normalizeNameForKey,
  resolveCanonicalKey as resolveCanonicalKeyWithAliases,
  stripPrimeSuffix,
} from './warframeSyncNaming.js';

const WORKSHEET_NAMES = [
  'Warframes',
  'Primary Weapons',
  'Secondary Weapons',
  'Melee Weapons',
  'Modular Weapons',
  'Companions',
  'Companion Weapons',
  'Archwing Weapons',
  'Accessories',
] as const;

type WorksheetName = (typeof WORKSHEET_NAMES)[number];

const DISCARDED_ROWS = new Set([
  'Drifter',
  'Operator',
  "Sevagoth's Shadow",
  'Stalker',
  'Suda Specter',
]);

const PRIME_ONLY_UNAVAILABLE = new Map<string, WorksheetName>([
  ['Gotva', 'Primary Weapons'],
  ['Vadarya', 'Primary Weapons'],
  ['Euphona', 'Secondary Weapons'],
  ['Sagek', 'Secondary Weapons'],
  ['Dakra', 'Melee Weapons'],
  ['Galariak', 'Melee Weapons'],
  ['Reaper', 'Melee Weapons'],
]);

const KEPT_SPECIAL_ROWS = new Map<
  string,
  {
    worksheet: WorksheetName;
    hasPrimeVariant: boolean;
  }
>([
  ['Lizzie', { worksheet: 'Primary Weapons', hasPrimeVariant: false }],
  ['Pangolin', { worksheet: 'Melee Weapons', hasPrimeVariant: true }],
  ['Vinquibus (Melee)', { worksheet: 'Melee Weapons', hasPrimeVariant: false }],
  ['Mote Amp', { worksheet: 'Modular Weapons', hasPrimeVariant: false }],
  ['Crescent Vulpaphyla', { worksheet: 'Companions', hasPrimeVariant: false }],
  ['Panzer Vulpaphyla', { worksheet: 'Companions', hasPrimeVariant: false }],
  ['Sly Vulpaphyla', { worksheet: 'Companions', hasPrimeVariant: false }],
  ['Vizier Predasite', { worksheet: 'Companions', hasPrimeVariant: false }],
  ['Medjay Predasite', { worksheet: 'Companions', hasPrimeVariant: false }],
  ['Pharaoh Predasite', { worksheet: 'Companions', hasPrimeVariant: false }],
  ['Arquebex', { worksheet: 'Archwing Weapons', hasPrimeVariant: false }],
  ['Ironbride', { worksheet: 'Archwing Weapons', hasPrimeVariant: false }],
]);

const MATCH_NAME_ALIASES = new Map<string, string>([
  ['pangolin', 'pangolin sword'],
  ['prime laser rifle', 'laser rifle'],
  ['venari prime claws', 'venari claws'],
  ['venani prime claws', 'venari claws'],
]);

const SPECIAL_PRIME_VARIANT_BASE_NAME = new Map<string, string>([
  ['prime laser rifle', 'Laser Rifle'],
  ['venari prime claws', 'Venari Claws'],
  ['venani prime claws', 'Venari Claws'],
]);

type DesiredEntry = {
  displayName: string;
  hasBaseVariant: boolean;
  hasPrimeVariant: boolean;
};

export type WorksheetSyncResult = {
  worksheet: WorksheetName;
  added: string[];
  deleted: string[];
  markedUnavailable: string[];
  mismatched: number[];
};

export type UserSyncResult = {
  userId: number;
  worksheets: WorksheetSyncResult[];
};

export type WarframeSyncResult = {
  mode: 'preview' | 'execute';
  users: UserSyncResult[];
  summary: {
    added: number;
    deleted: number;
    markedUnavailable: number;
    mismatched: number;
  };
  cleanup: {
    deleted: number;
    requiresConfirmation: number;
    deletedRows: CleanupCandidate[];
    requiresConfirmationRows: CleanupCandidate[];
  };
};

type CleanupCandidate = {
  userId: number;
  worksheet: WorksheetName;
  rowId: number;
  itemName: string;
  canonicalKey: string;
};

type VariantColumns = {
  baseColumnIds: number[];
  primeColumnIds: number[];
};

function resolveCanonicalKey(value: string): string {
  return resolveCanonicalKeyWithAliases(value, MATCH_NAME_ALIASES);
}

function getSpecialPrimeVariantBaseName(value: string): string | undefined {
  return SPECIAL_PRIME_VARIANT_BASE_NAME.get(normalizeNameForKey(value));
}

function stripKitgunPrimarySuffix(value: string): string {
  return value.replace(/\s*\(primary\)\s*$/i, '').trim();
}

function loadNames(
  db: Database.Database,
  sql: string,
  args: unknown[] = [],
): string[] {
  const rows = db.prepare(sql).all(...args) as { name: string | null }[];
  return rows
    .map((row) => row.name?.trim() ?? '')
    .filter((name) => name.length > 0);
}

type WeaponSourceRow = {
  name: string | null;
  unique_name: string | null;
};

function isModularMainComponent(row: WeaponSourceRow): boolean {
  const name = row.name?.trim() ?? '';
  if (!name) return false;
  if (/\bprism\b/i.test(name)) return true;
  if (/\bscaffold\b/i.test(name)) return false;

  const uniqueName = row.unique_name?.toLowerCase() ?? '';
  if (!uniqueName) return false;
  if (uniqueName.includes('/prism/')) return true;
  if (uniqueName.includes('/scaffold/')) return false;
  if (uniqueName.includes('/barrel/')) return true;
  if (
    uniqueName.includes('/tip/') ||
    uniqueName.includes('/tips/') ||
    uniqueName.includes('/strike/')
  ) {
    return true;
  }

  const removablePartMarkers = [
    '/handle/',
    '/handles/',
    '/grip/',
    '/brace/',
    '/link/',
    '/balance/',
    '/loader/',
    '/clip/',
    '/core/',
  ];
  for (const marker of removablePartMarkers) {
    if (uniqueName.includes(marker)) {
      return false;
    }
  }
  return false;
}

function loadModularWeaponNames(parametricDb: Database.Database): Set<string> {
  const modularRows = parametricDb
    .prepare(
      "SELECT name, unique_name FROM weapons WHERE product_category IN ('ModularPrimary', 'ModularSecondary', 'Amps') AND name IS NOT NULL AND slot IS NOT NULL AND TRIM(slot) <> ''",
    )
    .all() as WeaponSourceRow[];
  const names = new Set<string>();
  for (const row of modularRows) {
    if (!isModularMainComponent(row)) continue;
    const name = row.name?.trim() ?? '';
    if (name) {
      names.add(name);
    }
  }
  return names;
}

function isCompanionModularMainComponent(row: WeaponSourceRow): boolean {
  const uniqueName = row.unique_name?.toLowerCase() ?? '';
  if (!uniqueName) return false;

  const isMoaHead =
    uniqueName.includes('/moapetparts/') && uniqueName.includes('/moapethead');
  if (isMoaHead) return true;

  const isHoundHead =
    uniqueName.includes('/zanukapetparts/') &&
    uniqueName.includes('/zanukapetparthead');
  if (isHoundHead) return true;

  return false;
}

function loadCompanionNames(parametricDb: Database.Database): Set<string> {
  const companionNames = new Set(
    loadNames(
      parametricDb,
      "SELECT name FROM companions WHERE name IS NOT NULL AND TRIM(name) <> ''",
    ),
  );
  const modularCompanionRows = parametricDb
    .prepare(
      "SELECT name, unique_name FROM weapons WHERE product_category = 'Pistols' AND slot IS NULL AND name IS NOT NULL AND unique_name IS NOT NULL AND (LOWER(unique_name) LIKE '%/moapetparts/%' OR LOWER(unique_name) LIKE '%/zanukapetparts/%')",
    )
    .all() as WeaponSourceRow[];
  for (const row of modularCompanionRows) {
    if (!isCompanionModularMainComponent(row)) continue;
    const name = row.name?.trim() ?? '';
    if (name) {
      companionNames.add(name);
    }
  }
  return companionNames;
}

function ensureWorksheetExistsForSync(
  corpusDb: Database.Database,
  userId: number,
  worksheet: WorksheetName,
  execute: boolean,
): { id: number; name: string; display_order: number } | undefined {
  const existing = q.getWorksheetByName(corpusDb, userId, worksheet);
  if (existing) return existing;
  if (!execute) return undefined;

  const existingWorksheets = q.getWorksheets(corpusDb, userId);
  const displayOrder =
    existingWorksheets.reduce(
      (maxOrder, sheet) =>
        Math.max(maxOrder, sheet.display_order ?? Number.MIN_SAFE_INTEGER),
      -1,
    ) + 1;
  const worksheetId = q.createWorksheet(
    corpusDb,
    userId,
    worksheet,
    displayOrder,
  );
  q.addColumn(corpusDb, worksheetId, userId, 'Normal', 0);
  q.addColumn(corpusDb, worksheetId, userId, 'Prime', 1);
  if (worksheet === 'Warframes') {
    q.addColumn(corpusDb, worksheetId, userId, 'Helminth', 2);
  }
  return q.getWorksheetByName(corpusDb, userId, worksheet);
}

function loadWorksheetSource(
  parametricDb: Database.Database,
): Record<WorksheetName, Set<string>> {
  const warframes = new Set(
    loadNames(
      parametricDb,
      "SELECT name FROM warframes WHERE product_category = 'Suits'",
    ),
  );
  const accessories = new Set(
    loadNames(
      parametricDb,
      "SELECT name FROM warframes WHERE product_category IN ('SpaceSuits', 'MechSuits')",
    ),
  );
  const primary = new Set(
    loadNames(
      parametricDb,
      "SELECT name FROM weapons WHERE product_category = 'LongGuns' AND slot IS NOT NULL AND TRIM(slot) <> ''",
    ),
  );
  const secondary = new Set(
    loadNames(
      parametricDb,
      "SELECT name FROM weapons WHERE product_category = 'Pistols' AND slot IS NOT NULL AND TRIM(slot) <> ''",
    ),
  );
  const melee = new Set(
    loadNames(
      parametricDb,
      "SELECT name FROM weapons WHERE product_category = 'Melee' AND slot IS NOT NULL AND TRIM(slot) <> ''",
    ),
  );
  const archwing = new Set(
    loadNames(
      parametricDb,
      "SELECT name FROM weapons WHERE product_category IN ('SpaceGuns', 'SpaceMelee') AND slot IS NOT NULL AND TRIM(slot) <> ''",
    ),
  );
  const companionWeapons = new Set(
    loadNames(
      parametricDb,
      "SELECT name FROM weapons WHERE product_category = 'SentinelWeapons' AND slot IS NOT NULL AND TRIM(slot) <> ''",
    ),
  );
  const modular = loadModularWeaponNames(parametricDb);
  const companions = loadCompanionNames(parametricDb);

  return {
    Warframes: warframes,
    Accessories: accessories,
    'Primary Weapons': primary,
    'Secondary Weapons': secondary,
    'Melee Weapons': melee,
    Companions: companions,
    'Companion Weapons': companionWeapons,
    'Archwing Weapons': archwing,
    'Modular Weapons': modular,
  };
}

function appendCurrentSpecialItemPlacements(
  sourceByWorksheet: Record<WorksheetName, Set<string>>,
  currentRowsByWorksheet: Map<WorksheetName, string[]>,
  parametricDb: Database.Database,
): void {
  const specialNames = new Set(
    loadNames(
      parametricDb,
      "SELECT name FROM weapons WHERE product_category = 'SpecialItems' AND name IS NOT NULL AND slot IS NOT NULL AND TRIM(slot) <> ''",
    ),
  );
  for (const worksheet of [
    'Primary Weapons',
    'Secondary Weapons',
    'Melee Weapons',
  ] as const) {
    for (const rowName of currentRowsByWorksheet.get(worksheet) ?? []) {
      if (specialNames.has(rowName)) {
        sourceByWorksheet[worksheet].add(rowName);
      }
    }
  }
}

function cloneWorksheetSource(
  sourceByWorksheet: Record<WorksheetName, Set<string>>,
): Record<WorksheetName, Set<string>> {
  const cloned = {} as Record<WorksheetName, Set<string>>;
  for (const worksheet of WORKSHEET_NAMES) {
    cloned[worksheet] = new Set(sourceByWorksheet[worksheet]);
  }
  return cloned;
}

function createDesiredEntries(
  worksheet: WorksheetName,
  sourceNames: Set<string>,
): Map<string, DesiredEntry> {
  const desired = new Map<string, DesiredEntry>();
  for (const sourceName of sourceNames) {
    const displayName = normalizeDisplayName(sourceName);
    if (!displayName) continue;
    const key = resolveCanonicalKey(displayName);
    if (!key) continue;
    const specialPrimeBaseName = getSpecialPrimeVariantBaseName(displayName);
    const isPrime =
      isPrimeVariantName(displayName) || specialPrimeBaseName !== undefined;
    const canonicalDisplayName = isPrime
      ? (specialPrimeBaseName ?? stripPrimeSuffix(displayName))
      : displayName;
    const existing = desired.get(key);
    if (!existing) {
      desired.set(key, {
        displayName: canonicalDisplayName,
        hasBaseVariant: !isPrime,
        hasPrimeVariant: isPrime,
      });
      continue;
    }
    desired.set(key, {
      displayName: existing.hasBaseVariant
        ? existing.displayName
        : isPrime
          ? existing.displayName
          : displayName,
      hasBaseVariant: existing.hasBaseVariant || !isPrime,
      hasPrimeVariant: existing.hasPrimeVariant || isPrime,
    });
  }

  for (const [itemName, itemRule] of KEPT_SPECIAL_ROWS.entries()) {
    if (itemRule.worksheet !== worksheet) continue;
    const displayName = normalizeDisplayName(itemName);
    desired.set(resolveCanonicalKey(displayName), {
      displayName,
      hasBaseVariant: true,
      hasPrimeVariant: itemRule.hasPrimeVariant,
    });
  }

  for (const [itemName, itemWorksheet] of PRIME_ONLY_UNAVAILABLE.entries()) {
    if (itemWorksheet !== worksheet) continue;
    const displayName = normalizeDisplayName(itemName);
    desired.set(resolveCanonicalKey(displayName), {
      displayName: itemName,
      hasBaseVariant: false,
      hasPrimeVariant: true,
    });
  }

  return desired;
}

function resolveVariantColumns(
  columns: Array<{ id: number; name: string }>,
): VariantColumns {
  const baseColumnIds: number[] = [];
  const primeColumnIds: number[] = [];
  for (const column of columns) {
    if (column.name === 'Helminth') continue;
    if (/prime/i.test(column.name)) {
      primeColumnIds.push(column.id);
      continue;
    }
    baseColumnIds.push(column.id);
  }
  return { baseColumnIds, primeColumnIds };
}

function reconcileVariantAvailability(params: {
  corpusDb: Database.Database;
  userId: number;
  rowId: number;
  desiredEntry: DesiredEntry;
  variantColumns: VariantColumns;
  execute: boolean;
}): boolean {
  const { corpusDb, userId, rowId, desiredEntry, variantColumns, execute } =
    params;
  const targetValuesByColumn = new Map<number, '' | 'Unavailable'>();
  if (!desiredEntry.hasBaseVariant) {
    for (const columnId of variantColumns.baseColumnIds) {
      targetValuesByColumn.set(columnId, 'Unavailable');
    }
  } else {
    for (const columnId of variantColumns.baseColumnIds) {
      targetValuesByColumn.set(columnId, '');
    }
  }
  if (!desiredEntry.hasPrimeVariant) {
    for (const columnId of variantColumns.primeColumnIds) {
      targetValuesByColumn.set(columnId, 'Unavailable');
    }
  } else {
    for (const columnId of variantColumns.primeColumnIds) {
      targetValuesByColumn.set(columnId, '');
    }
  }
  if (targetValuesByColumn.size === 0) return false;

  let hasChange = false;
  for (const [columnId, targetValue] of targetValuesByColumn.entries()) {
    const currentValue =
      q.getCellValue(corpusDb, rowId, columnId, userId) ?? '';
    const nextValue =
      targetValue === 'Unavailable'
        ? 'Unavailable'
        : currentValue === 'Unavailable'
          ? ''
          : currentValue;
    if (currentValue === nextValue) {
      continue;
    }
    hasChange = true;
    if (execute) {
      q.adminUpdateCell(corpusDb, rowId, columnId, nextValue, userId);
    }
  }

  if (!hasChange) {
    return false;
  }
  return true;
}

function rowHasUserProgress(
  rowValues: Record<number, string>,
  columns: Array<{ id: number; name: string }>,
): boolean {
  for (const column of columns) {
    const value = rowValues[column.id] ?? '';
    if (column.name === 'Helminth') {
      if (value === 'Yes') return true;
      continue;
    }
    if (value !== '' && value !== 'Unavailable') {
      return true;
    }
  }
  return false;
}

function cleanupDuplicateVariantRows(params: {
  corpusDb: Database.Database;
  userId: number;
  sheetId: number;
  worksheet: WorksheetName;
  execute: boolean;
}): {
  deletedItemNames: string[];
  deletedRows: CleanupCandidate[];
  requiresConfirmationRows: CleanupCandidate[];
} {
  const { corpusDb, userId, sheetId, worksheet, execute } = params;
  const worksheetData = q.getWorksheetData(corpusDb, sheetId, userId);
  if (!worksheetData) {
    return {
      deletedItemNames: [],
      deletedRows: [],
      requiresConfirmationRows: [],
    };
  }

  const groups = new Map<
    string,
    Array<{
      id: number;
      name: string;
      hasProgress: boolean;
      isPrime: boolean;
    }>
  >();
  for (const row of worksheetData.rows) {
    const key = resolveCanonicalKey(row.name);
    if (!key) continue;
    const bucket = groups.get(key) ?? [];
    bucket.push({
      id: row.id,
      name: row.name,
      hasProgress: rowHasUserProgress(row.values, worksheetData.columns),
      isPrime: isPrimeVariantName(row.name),
    });
    groups.set(key, bucket);
  }

  const deletedRows: CleanupCandidate[] = [];
  const requiresConfirmationRows: CleanupCandidate[] = [];

  for (const [canonicalKey, bucket] of groups.entries()) {
    if (bucket.length <= 1) continue;
    bucket.sort((a, b) => {
      if (a.hasProgress !== b.hasProgress) {
        return a.hasProgress ? -1 : 1;
      }
      if (a.isPrime !== b.isPrime) {
        return a.isPrime ? 1 : -1;
      }
      return a.id - b.id;
    });
    const keep = bucket[0];
    for (const row of bucket) {
      if (row.id === keep?.id) continue;
      const candidate: CleanupCandidate = {
        userId,
        worksheet,
        rowId: row.id,
        itemName: row.name,
        canonicalKey,
      };
      if (row.hasProgress) {
        requiresConfirmationRows.push(candidate);
        continue;
      }
      if (execute) {
        q.deleteRow(corpusDb, row.id, userId);
      }
      deletedRows.push(candidate);
    }
  }

  return {
    deletedItemNames: deletedRows.map((row) => row.itemName),
    deletedRows,
    requiresConfirmationRows,
  };
}

type RunSyncOptions = {
  execute: boolean;
  userIds?: number[];
  initiatedByUserId?: number;
};

export function runWarframeSync(
  corpusDb: Database.Database,
  options: RunSyncOptions,
): WarframeSyncResult {
  if (
    options.execute &&
    (!Number.isInteger(options.initiatedByUserId) ||
      (options.initiatedByUserId ?? 0) <= 0)
  ) {
    throw new Error(
      'A valid initiating admin user id is required for execute mode.',
    );
  }
  const mode = options.execute ? 'execute' : 'preview';
  const parametricDb = new Database(PARAMETRIC_DB_PATH, {
    readonly: true,
    fileMustExist: true,
  });
  try {
    const sourceByWorksheet = loadWorksheetSource(parametricDb);
    const userIds = options.userIds ?? q.getWorksheetUserIds(corpusDb);
    const users: UserSyncResult[] = [];
    const summary = {
      added: 0,
      deleted: 0,
      markedUnavailable: 0,
      mismatched: 0,
    };
    const cleanupDeletedRows: CleanupCandidate[] = [];
    const cleanupRequiresConfirmationRows: CleanupCandidate[] = [];

    for (const userId of userIds) {
      const sourceByWorksheetForUser = cloneWorksheetSource(sourceByWorksheet);
      const currentRowsByWorksheet = new Map<WorksheetName, string[]>();
      for (const worksheet of WORKSHEET_NAMES) {
        const sheet = ensureWorksheetExistsForSync(
          corpusDb,
          userId,
          worksheet,
          options.execute,
        );
        if (!sheet) continue;
        const rows = q.getWorksheetRows(corpusDb, sheet.id, userId);
        currentRowsByWorksheet.set(
          worksheet,
          rows.map((row) => row.item_name),
        );
      }
      appendCurrentSpecialItemPlacements(
        sourceByWorksheetForUser,
        currentRowsByWorksheet,
        parametricDb,
      );

      const worksheetResults: WorksheetSyncResult[] = [];
      for (const worksheet of WORKSHEET_NAMES) {
        const sheet = ensureWorksheetExistsForSync(
          corpusDb,
          userId,
          worksheet,
          options.execute,
        );
        if (!sheet) continue;
        const desired = createDesiredEntries(
          worksheet,
          sourceByWorksheetForUser[worksheet],
        );
        let rows = q.getWorksheetRows(corpusDb, sheet.id, userId);
        const columns = q.getWorksheetColumns(corpusDb, sheet.id, userId);
        const variantColumns = resolveVariantColumns(columns);

        const existingByKey = new Map<string, typeof rows>();
        for (const row of rows) {
          const key = resolveCanonicalKey(row.item_name);
          const bucket = existingByKey.get(key) ?? [];
          bucket.push(row);
          existingByKey.set(key, bucket);
        }

        const toAdd: string[] = [];
        for (const [key, entry] of desired.entries()) {
          if (!existingByKey.has(key)) {
            toAdd.push(entry.displayName);
          }
        }

        const added: string[] = [];
        if (options.execute) {
          for (const name of toAdd) {
            q.addRowWithEmptyValues(corpusDb, sheet.id, userId, name);
            added.push(name);
          }
          rows = q.getWorksheetRows(corpusDb, sheet.id, userId);
        }

        const deleted: string[] = [];
        const markedUnavailable: string[] = [];
        const mismatched: number[] = [];

        for (const row of rows) {
          const normalizedItemName =
            worksheet === 'Modular Weapons'
              ? stripKitgunPrimarySuffix(row.item_name)
              : row.item_name;
          const didNormalizeKitgunName =
            normalizedItemName !== row.item_name &&
            resolveCanonicalKey(normalizedItemName) ===
              resolveCanonicalKey(row.item_name);
          if (didNormalizeKitgunName && options.execute) {
            q.editRow(corpusDb, row.id, userId, normalizedItemName, {});
          }
          const effectiveItemName = didNormalizeKitgunName
            ? normalizedItemName
            : row.item_name;

          if (DISCARDED_ROWS.has(effectiveItemName)) {
            if (options.execute) {
              q.deleteRow(corpusDb, row.id, userId);
            }
            deleted.push(effectiveItemName);
            continue;
          }
          const key = resolveCanonicalKey(effectiveItemName);
          const desiredEntry = desired.get(key);
          if (!desiredEntry) {
            mismatched.push(row.id);
            continue;
          }
          const didMarkUnavailable = reconcileVariantAvailability({
            corpusDb,
            userId,
            rowId: row.id,
            desiredEntry,
            variantColumns,
            execute: options.execute,
          });
          if (didMarkUnavailable) {
            markedUnavailable.push(effectiveItemName);
          }
        }

        const cleanup = cleanupDuplicateVariantRows({
          corpusDb,
          userId,
          sheetId: sheet.id,
          worksheet,
          execute: options.execute,
        });
        if (cleanup.deletedItemNames.length > 0) {
          deleted.push(...cleanup.deletedItemNames);
        }
        cleanupDeletedRows.push(...cleanup.deletedRows);
        cleanupRequiresConfirmationRows.push(
          ...cleanup.requiresConfirmationRows,
        );

        worksheetResults.push({
          worksheet,
          added: options.execute ? added : toAdd,
          deleted,
          markedUnavailable,
          mismatched,
        });

        summary.added += (options.execute ? added : toAdd).length;
        summary.deleted += deleted.length;
        summary.markedUnavailable += markedUnavailable.length;
        summary.mismatched += mismatched.length;
      }

      users.push({ userId, worksheets: worksheetResults });
    }

    return {
      mode,
      users,
      summary,
      cleanup: {
        deleted: cleanupDeletedRows.length,
        requiresConfirmation: cleanupRequiresConfirmationRows.length,
        deletedRows: cleanupDeletedRows,
        requiresConfirmationRows: cleanupRequiresConfirmationRows,
      },
    };
  } finally {
    parametricDb.close();
  }
}
