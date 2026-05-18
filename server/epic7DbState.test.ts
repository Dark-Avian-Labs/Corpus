import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const dbPath = path.join(os.tmpdir(), `codex-epic7-test-${process.pid}.db`);

vi.mock('@codex/game-epic7', () => ({
  EPIC7_DB_PATH: dbPath,
}));

describe('epic7DbState', () => {
  beforeAll(async () => {
    await fs.mkdir(path.dirname(dbPath), { recursive: true }).catch(() => undefined);
  });

  afterEach(async () => {
    await fs.unlink(dbPath).catch(() => undefined);
    vi.resetModules();
  });

  it('reports available when database file exists', async () => {
    await fs.writeFile(dbPath, '');
    const { refreshEpic7DbAvailability, isEpic7DbAvailable } = await import('./epic7DbState.js');
    await refreshEpic7DbAvailability();
    expect(isEpic7DbAvailable()).toBe(true);
  });

  it('reports unavailable when database file is missing', async () => {
    const { refreshEpic7DbAvailability, isEpic7DbAvailable } = await import('./epic7DbState.js');
    await refreshEpic7DbAvailability();
    expect(isEpic7DbAvailable()).toBe(false);
  });

  it('deduplicates concurrent refresh calls', async () => {
    const accessSpy = vi.spyOn(fs, 'access').mockResolvedValue(undefined);
    await fs.writeFile(dbPath, '');
    const { refreshEpic7DbAvailability, isEpic7DbAvailable } = await import('./epic7DbState.js');

    await Promise.all([refreshEpic7DbAvailability(), refreshEpic7DbAvailability(), refreshEpic7DbAvailability()]);

    expect(accessSpy).toHaveBeenCalledTimes(1);
    expect(isEpic7DbAvailable()).toBe(true);
    accessSpy.mockRestore();
  });
});
