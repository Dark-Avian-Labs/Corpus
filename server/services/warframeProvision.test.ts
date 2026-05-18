import type Database from 'better-sqlite3';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getWorksheets: vi.fn<typeof import('@codex/game-warframe').warframeQueries.getWorksheets>(),
  runWarframeSync: vi.fn(),
  ensureWarframeWorksheetsForUser: vi.fn(),
  existsSync: vi.fn<(path: string) => boolean>(),
}));

vi.mock('fs', () => ({
  default: { existsSync: (path: string) => mocks.existsSync(path) },
  existsSync: (path: string) => mocks.existsSync(path),
}));

vi.mock('@codex/game-warframe', () => ({
  warframeQueries: { getWorksheets: mocks.getWorksheets },
}));

vi.mock('./warframeSync.js', () => ({
  runWarframeSync: mocks.runWarframeSync,
  ensureWarframeWorksheetsForUser: mocks.ensureWarframeWorksheetsForUser,
}));

vi.mock('../logger.js', () => ({
  log: vi.fn(),
}));

import { provisionWarframeUserIfNeeded } from './warframeProvision.js';

const codexDb = {} as Database.Database;

describe('provisionWarframeUserIfNeeded', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.existsSync.mockReturnValue(false);
  });

  it('does nothing when the user already has worksheets', () => {
    mocks.getWorksheets.mockReturnValue([{ id: 1, name: 'Warframes', display_order: 0 }]);
    provisionWarframeUserIfNeeded(codexDb, 7);
    expect(mocks.runWarframeSync).not.toHaveBeenCalled();
    expect(mocks.ensureWarframeWorksheetsForUser).not.toHaveBeenCalled();
  });

  it('runs Armory sync when the Armory database is available', () => {
    mocks.getWorksheets.mockReturnValueOnce([]).mockReturnValueOnce([{ id: 1, name: 'Warframes', display_order: 0 }]);
    mocks.existsSync.mockReturnValue(true);
    provisionWarframeUserIfNeeded(codexDb, 42);
    expect(mocks.runWarframeSync).toHaveBeenCalledWith(codexDb, {
      execute: true,
      userIds: [42],
      initiatedByUserId: 42,
    });
    expect(mocks.ensureWarframeWorksheetsForUser).not.toHaveBeenCalled();
  });

  it('creates empty worksheets when Armory sync is unavailable', () => {
    mocks.getWorksheets.mockReturnValue([]);
    mocks.existsSync.mockReturnValue(false);
    provisionWarframeUserIfNeeded(codexDb, 42);
    expect(mocks.runWarframeSync).not.toHaveBeenCalled();
    expect(mocks.ensureWarframeWorksheetsForUser).toHaveBeenCalledWith(codexDb, 42);
  });

  it('creates empty worksheets when sync leaves the user without worksheets', () => {
    mocks.getWorksheets.mockReturnValue([]);
    mocks.existsSync.mockReturnValue(true);
    mocks.runWarframeSync.mockImplementation(() => undefined);
    provisionWarframeUserIfNeeded(codexDb, 42);
    expect(mocks.runWarframeSync).toHaveBeenCalled();
    expect(mocks.ensureWarframeWorksheetsForUser).toHaveBeenCalledWith(codexDb, 42);
  });
});
