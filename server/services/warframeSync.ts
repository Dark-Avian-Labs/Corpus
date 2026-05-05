import { warframeQueries as q } from '@codex/game-warframe';
import {
  isPrimeVariantName,
  normalizeDisplayName,
  normalizeNameForKey,
  resolveCanonicalKey as resolveCanonicalKeyWithAliases,
  resolveVariantColumns,
  stripPrimeSuffix,
  type VariantColumns,
} from '@codex/game-warframe';
import Database from 'better-sqlite3';

import { ARMORY_DB_PATH } from '../config.js';

const WORKSHEET_NAMES = [
  'Warframes',
  'Primary Weapons',
  'Secondary Weapons',
  'Melee Weapons',
  'Modular Weapons',
  'K-Drives',
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

const K_DRIVE_NAME_WHITELIST = new Set([
  'bad baby',
  'feverspine',
  'flatbelly',
  'needlenose',
  'runway',
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
  marketLinkSync: WarframeMarketLinkSyncSummary;
};

export type WarframeMarketLinkSyncSummary =
  | { ran: false }
  | {
      ran: true;
      rowsProcessed: number;
      rowsWithLink: number;
      failedWorksheets: Array<{ userId: number; worksheet: WorksheetName }>;
    };

type CleanupCandidate = {
  userId: number;
  worksheet: WorksheetName;
  rowId: number;
  itemName: string;
  canonicalKey: string;
};

function resolveCanonicalKey(value: string): string {
  return resolveCanonicalKeyWithAliases(value, MATCH_NAME_ALIASES);
}

type MarketHrefRefreshResult =
  | { ok: true; rowsProcessed: number; rowsWithHref: number }
  | { ok: false; error: string };

function refreshWorksheetMarketHrefs(
  codexDb: Database.Database,
  armoryDb: Database.Database,
  userId: number,
  worksheetId: number,
  worksheet: WorksheetName,
): MarketHrefRefreshResult {
  try {
    const sel = armoryDb.prepare(
      `SELECT market_href, market_href_prime FROM warframe_market_links WHERE canonical_key = ? AND worksheet_category = ?`,
    );
    const rows = q.getWorksheetRows(codexDb, worksheetId, userId);
    const stmt = codexDb.prepare(
      'UPDATE rows SET market_href = ?, market_href_prime = ? WHERE id = ?',
    );
    let rowsProcessed = 0;
    let rowsWithHref = 0;
    const tx = codexDb.transaction(() => {
      for (const row of rows) {
        const effectiveName =
          worksheet === 'Modular Weapons' ? stripKitgunPrimarySuffix(row.item_name) : row.item_name;
        const key = resolveCanonicalKey(effectiveName);
        const hit = sel.get(key, worksheet) as
          | { market_href: string | null; market_href_prime: string | null }
          | undefined;
        const href = hit?.market_href ?? null;
        const hrefPrime = hit?.market_href_prime ?? null;
        stmt.run(href, hrefPrime, row.id);
        rowsProcessed += 1;
        const hasAny =
          (typeof href === 'string' && href.trim().length > 0) ||
          (typeof hrefPrime === 'string' && hrefPrime.trim().length > 0);
        if (hasAny) {
          rowsWithHref += 1;
        }
      }
    });
    tx();
    return { ok: true, rowsProcessed, rowsWithHref };
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.warn(
      `[Warframe sync] market href refresh failed: userId=${userId}, worksheetId=${worksheetId}, worksheet=${worksheet}`,
      err.stack ?? err.message,
    );
    return { ok: false, error: err.message };
  }
}

function getSpecialPrimeVariantBaseName(value: string): string | undefined {
  return SPECIAL_PRIME_VARIANT_BASE_NAME.get(normalizeNameForKey(value));
}

function stripKitgunPrimarySuffix(value: string): string {
  return value.replace(/\s*\(primary\)\s*$/i, '').trim();
}

function loadNames(db: Database.Database, sql: string, args: unknown[] = []): string[] {
  const rows = db.prepare(sql).all(...args) as { name: string | null }[];
  return rows.map((row) => row.name?.trim() ?? '').filter((name) => name.length > 0);
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

function loadModularWeaponNames(armoryDb: Database.Database): Set<string> {
  const modularRows = armoryDb
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

  const isMoaHead = uniqueName.includes('/moapetparts/') && uniqueName.includes('/moapethead');
  if (isMoaHead) return true;

  const isHoundHead =
    uniqueName.includes('/zanukapetparts/') && uniqueName.includes('/zanukapetparthead');
  if (isHoundHead) return true;

  return false;
}

function loadCompanionNames(armoryDb: Database.Database): Set<string> {
  const companionNames = new Set(
    loadNames(armoryDb, "SELECT name FROM companions WHERE name IS NOT NULL AND TRIM(name) <> ''"),
  );
  const modularCompanionRows = armoryDb
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

function loadKDriveNames(armoryDb: Database.Database): Set<string> {
  const kDriveRows = armoryDb
    .prepare(
      "SELECT name, unique_name FROM weapons WHERE name IS NOT NULL AND TRIM(name) <> '' AND (LOWER(product_category) LIKE '%hoverboard%' OR LOWER(unique_name) LIKE '%/types/vehicles/hoverboard/%')",
    )
    .all() as WeaponSourceRow[];
  const names = new Set<string>();
  for (const row of kDriveRows) {
    const displayName = normalizeDisplayName(row.name?.trim() ?? '');
    if (!displayName) continue;
    if (!K_DRIVE_NAME_WHITELIST.has(normalizeNameForKey(displayName))) continue;
    names.add(displayName);
  }
  return names;
}

function ensureWorksheetExistsForSync(
  codexDb: Database.Database,
  userId: number,
  worksheet: WorksheetName,
  execute: boolean,
): { id: number; name: string; display_order: number } | undefined {
  const existing = q.getWorksheetByName(codexDb, userId, worksheet);
  if (existing) return existing;
  if (!execute) return undefined;

  const existingWorksheets = q.getWorksheets(codexDb, userId);
  const displayOrder =
    existingWorksheets.reduce(
      (maxOrder, sheet) => Math.max(maxOrder, sheet.display_order ?? Number.MIN_SAFE_INTEGER),
      -1,
    ) + 1;
  const worksheetId = q.createWorksheet(codexDb, userId, worksheet, displayOrder);
  q.addColumn(codexDb, worksheetId, userId, 'Normal', 0);
  q.addColumn(codexDb, worksheetId, userId, 'Prime', 1);
  if (worksheet === 'Warframes') {
    q.addColumn(codexDb, worksheetId, userId, 'Helminth', 2);
  }
  return q.getWorksheetByName(codexDb, userId, worksheet);
}

function loadWorksheetSource(armoryDb: Database.Database): Record<WorksheetName, Set<string>> {
  const warframes = new Set(
    loadNames(armoryDb, "SELECT name FROM warframes WHERE product_category = 'Suits'"),
  );
  const accessories = new Set(
    loadNames(
      armoryDb,
      "SELECT name FROM warframes WHERE product_category IN ('SpaceSuits', 'MechSuits')",
    ),
  );
  const primary = new Set(
    loadNames(
      armoryDb,
      "SELECT name FROM weapons WHERE product_category = 'LongGuns' AND slot IS NOT NULL AND TRIM(slot) <> ''",
    ),
  );
  const secondary = new Set(
    loadNames(
      armoryDb,
      "SELECT name FROM weapons WHERE product_category = 'Pistols' AND slot IS NOT NULL AND TRIM(slot) <> ''",
    ),
  );
  const melee = new Set(
    loadNames(
      armoryDb,
      "SELECT name FROM weapons WHERE product_category = 'Melee' AND slot IS NOT NULL AND TRIM(slot) <> ''",
    ),
  );
  const archwing = new Set(
    loadNames(
      armoryDb,
      "SELECT name FROM weapons WHERE product_category IN ('SpaceGuns', 'SpaceMelee') AND slot IS NOT NULL AND TRIM(slot) <> ''",
    ),
  );
  const companionWeapons = new Set(
    loadNames(
      armoryDb,
      "SELECT name FROM weapons WHERE product_category = 'SentinelWeapons' AND slot IS NOT NULL AND TRIM(slot) <> ''",
    ),
  );
  const modular = loadModularWeaponNames(armoryDb);
  const kDrives = loadKDriveNames(armoryDb);
  const companions = loadCompanionNames(armoryDb);

  return {
    Warframes: warframes,
    Accessories: accessories,
    'Primary Weapons': primary,
    'Secondary Weapons': secondary,
    'Melee Weapons': melee,
    'K-Drives': kDrives,
    Companions: companions,
    'Companion Weapons': companionWeapons,
    'Archwing Weapons': archwing,
    'Modular Weapons': modular,
  };
}

function appendCurrentSpecialItemPlacements(
  sourceByWorksheet: Record<WorksheetName, Set<string>>,
  currentRowsByWorksheet: Map<WorksheetName, string[]>,
  armoryDb: Database.Database,
): void {
  const specialNames = new Set(
    loadNames(
      armoryDb,
      "SELECT name FROM weapons WHERE product_category = 'SpecialItems' AND name IS NOT NULL AND slot IS NOT NULL AND TRIM(slot) <> ''",
    ),
  );
  for (const worksheet of ['Primary Weapons', 'Secondary Weapons', 'Melee Weapons'] as const) {
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
    const isPrime = isPrimeVariantName(displayName) || specialPrimeBaseName !== undefined;
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

function reconcileVariantAvailability(params: {
  codexDb: Database.Database;
  userId: number;
  rowId: number;
  desiredEntry: DesiredEntry;
  variantColumns: VariantColumns;
  execute: boolean;
}): boolean {
  const { codexDb, userId, rowId, desiredEntry, variantColumns, execute } = params;
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
    const currentValue = q.getCellValue(codexDb, rowId, columnId, userId) ?? '';
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
      q.adminUpdateCell(codexDb, rowId, columnId, nextValue, userId);
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
  codexDb: Database.Database;
  userId: number;
  sheetId: number;
  worksheet: WorksheetName;
  execute: boolean;
}): {
  deletedItemNames: string[];
  deletedRows: CleanupCandidate[];
  requiresConfirmationRows: CleanupCandidate[];
} {
  const { codexDb, userId, sheetId, worksheet, execute } = params;
  const worksheetData = q.getWorksheetData(codexDb, sheetId, userId);
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
        q.deleteRow(codexDb, row.id, userId);
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
  codexDb: Database.Database,
  options: RunSyncOptions,
): WarframeSyncResult {
  if (
    options.execute &&
    (!Number.isInteger(options.initiatedByUserId) || (options.initiatedByUserId ?? 0) <= 0)
  ) {
    throw new Error('A valid initiating admin user id is required for execute mode.');
  }
  const mode = options.execute ? 'execute' : 'preview';
  const armoryDb = new Database(ARMORY_DB_PATH, {
    readonly: true,
    fileMustExist: true,
  });
  try {
    const sourceByWorksheet = loadWorksheetSource(armoryDb);
    const userIds = options.userIds ?? q.getWorksheetUserIds(codexDb);
    const users: UserSyncResult[] = [];
    const summary = {
      added: 0,
      deleted: 0,
      markedUnavailable: 0,
      mismatched: 0,
    };
    const cleanupDeletedRows: CleanupCandidate[] = [];
    const cleanupRequiresConfirmationRows: CleanupCandidate[] = [];
    const marketLinkFailed: Array<{ userId: number; worksheet: WorksheetName }> = [];
    let marketRowsProcessed = 0;
    let marketRowsWithHref = 0;

    for (const userId of userIds) {
      const sourceByWorksheetForUser = cloneWorksheetSource(sourceByWorksheet);
      const currentRowsByWorksheet = new Map<WorksheetName, string[]>();
      for (const worksheet of WORKSHEET_NAMES) {
        const sheet = ensureWorksheetExistsForSync(codexDb, userId, worksheet, options.execute);
        if (!sheet) continue;
        const rows = q.getWorksheetRows(codexDb, sheet.id, userId);
        currentRowsByWorksheet.set(
          worksheet,
          rows.map((row) => row.item_name),
        );
      }
      appendCurrentSpecialItemPlacements(
        sourceByWorksheetForUser,
        currentRowsByWorksheet,
        armoryDb,
      );

      const worksheetResults: WorksheetSyncResult[] = [];
      for (const worksheet of WORKSHEET_NAMES) {
        const sheet = ensureWorksheetExistsForSync(codexDb, userId, worksheet, options.execute);
        if (!sheet) continue;
        const desired = createDesiredEntries(worksheet, sourceByWorksheetForUser[worksheet]);
        let rows = q.getWorksheetRows(codexDb, sheet.id, userId);
        const columns = q.getWorksheetColumns(codexDb, sheet.id, userId);
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
            q.addRowWithEmptyValues(codexDb, sheet.id, userId, name);
            added.push(name);
          }
          rows = q.getWorksheetRows(codexDb, sheet.id, userId);
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
            resolveCanonicalKey(normalizedItemName) === resolveCanonicalKey(row.item_name);
          if (didNormalizeKitgunName && options.execute) {
            q.editRow(codexDb, row.id, userId, normalizedItemName, {});
          }
          const effectiveItemName = didNormalizeKitgunName ? normalizedItemName : row.item_name;

          if (DISCARDED_ROWS.has(effectiveItemName)) {
            if (options.execute) {
              q.deleteRow(codexDb, row.id, userId);
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
            codexDb,
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
          codexDb,
          userId,
          sheetId: sheet.id,
          worksheet,
          execute: options.execute,
        });
        if (cleanup.deletedItemNames.length > 0) {
          deleted.push(...cleanup.deletedItemNames);
        }
        cleanupDeletedRows.push(...cleanup.deletedRows);
        cleanupRequiresConfirmationRows.push(...cleanup.requiresConfirmationRows);

        if (options.execute) {
          const mr = refreshWorksheetMarketHrefs(codexDb, armoryDb, userId, sheet.id, worksheet);
          if (mr.ok) {
            marketRowsProcessed += mr.rowsProcessed;
            marketRowsWithHref += mr.rowsWithHref;
          } else {
            marketLinkFailed.push({ userId, worksheet });
          }
        }

        if (worksheet === 'Warframes' && options.execute) {
          q.ensureHelminthNonSubsumableCells(codexDb, sheet.id, userId);
        }

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
      marketLinkSync: options.execute
        ? {
            ran: true,
            rowsProcessed: marketRowsProcessed,
            rowsWithLink: marketRowsWithHref,
            failedWorksheets: marketLinkFailed,
          }
        : { ran: false },
    };
  } finally {
    armoryDb.close();
  }
}
