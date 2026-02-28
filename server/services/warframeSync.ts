import { warframeQueries as q } from '@corpus/game-warframe';
import Database from 'better-sqlite3';

import { PARAMETRIC_DB_PATH } from '../config.js';

const WORKSHEET_NAMES = [
  'Warframes',
  'Primary Weapons',
  'Secondary Weapons',
  'Melee Weapons',
  'Modular Weapons',
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

const KEPT_SPECIAL_ROWS = new Map<string, WorksheetName>([
  ['Lizzie', 'Primary Weapons'],
  ['Pangolin', 'Melee Weapons'],
  ['Vinquibus (Melee)', 'Melee Weapons'],
  ['Mote Amp', 'Modular Weapons'],
  ['Arquebex', 'Archwing Weapons'],
  ['Ironbride', 'Archwing Weapons'],
]);

const MATCH_NAME_ALIASES = new Map<string, string>([
  ['pangolin', 'pangolin sword'],
]);

type DesiredEntry = {
  displayName: string;
  markUnavailable: boolean;
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
};

function normalizeName(value: string): string {
  const normalized = value.normalize('NFKC').trim();
  const withoutArchwingTag = normalized.replace(/^<[^>]+>\s*/i, '');
  const withoutQualifier = withoutArchwingTag.replace(
    /\s*\((primary|secondary|dual swords|heavy blade)\)\s*$/i,
    '',
  );
  return withoutQualifier.toLowerCase();
}

function resolveMatchKey(value: string): string {
  const key = normalizeName(value);
  return MATCH_NAME_ALIASES.get(key) ?? key;
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

function loadWorksheetSource(parametricDb: Database.Database): Record<
  WorksheetName,
  Set<string>
> {
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
      "SELECT name FROM weapons WHERE product_category = 'LongGuns'",
    ),
  );
  const secondary = new Set(
    loadNames(
      parametricDb,
      "SELECT name FROM weapons WHERE product_category = 'Pistols'",
    ),
  );
  const melee = new Set(
    loadNames(
      parametricDb,
      "SELECT name FROM weapons WHERE product_category = 'Melee'",
    ),
  );
  const archwing = new Set(
    loadNames(
      parametricDb,
      "SELECT name FROM weapons WHERE product_category IN ('SpaceGuns', 'SpaceMelee')",
    ),
  );
  const modular = new Set(
    loadNames(
      parametricDb,
      "SELECT name FROM weapons WHERE product_category IN ('ModularPrimary', 'ModularSecondary', 'Amps') AND name IS NOT NULL",
    ),
  );

  return {
    Warframes: warframes,
    Accessories: accessories,
    'Primary Weapons': primary,
    'Secondary Weapons': secondary,
    'Melee Weapons': melee,
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
      "SELECT name FROM weapons WHERE product_category = 'SpecialItems' AND name IS NOT NULL",
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
    desired.set(normalizeName(sourceName), {
      displayName: sourceName,
      markUnavailable: false,
    });
  }

  for (const [itemName, itemWorksheet] of KEPT_SPECIAL_ROWS.entries()) {
    if (itemWorksheet !== worksheet) continue;
    desired.set(resolveMatchKey(itemName), {
      displayName: itemName,
      markUnavailable: false,
    });
  }

  for (const [itemName, itemWorksheet] of PRIME_ONLY_UNAVAILABLE.entries()) {
    if (itemWorksheet !== worksheet) continue;
    desired.set(resolveMatchKey(itemName), {
      displayName: itemName,
      markUnavailable: true,
    });
  }

  return desired;
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

    for (const userId of userIds) {
      const sourceByWorksheetForUser = cloneWorksheetSource(sourceByWorksheet);
      const currentRowsByWorksheet = new Map<WorksheetName, string[]>();
      for (const worksheet of WORKSHEET_NAMES) {
        const sheet = q.getWorksheetByName(corpusDb, userId, worksheet);
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
        const sheet = q.getWorksheetByName(corpusDb, userId, worksheet);
        if (!sheet) continue;
        const desired = createDesiredEntries(
          worksheet,
          sourceByWorksheetForUser[worksheet],
        );
        let rows = q.getWorksheetRows(corpusDb, sheet.id, userId);

        const existingByKey = new Map<string, typeof rows>();
        for (const row of rows) {
          const key = resolveMatchKey(row.item_name);
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
          if (DISCARDED_ROWS.has(row.item_name)) {
            if (options.execute) {
              q.deleteRow(corpusDb, row.id, userId);
            }
            deleted.push(row.item_name);
            continue;
          }
          const key = resolveMatchKey(row.item_name);
          const desiredEntry = desired.get(key);
          if (!desiredEntry) {
            mismatched.push(row.id);
            continue;
          }
          if (desiredEntry.markUnavailable) {
            if (options.execute) {
              q.setRowUnavailable(corpusDb, row.id, userId);
            }
            markedUnavailable.push(row.item_name);
          }
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

    return { mode, users, summary };
  } finally {
    parametricDb.close();
  }
}

