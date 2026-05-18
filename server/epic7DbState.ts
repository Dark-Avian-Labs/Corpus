import fs from 'fs/promises';

import { EPIC7_DB_PATH } from '@codex/game-epic7';

let epic7DbAvailable = false;
let refreshEpic7DbPromise: Promise<void> | null = null;

async function runRefreshEpic7DbAvailability(): Promise<void> {
  try {
    await fs.access(EPIC7_DB_PATH);
    epic7DbAvailable = true;
  } catch {
    epic7DbAvailable = false;
  }
}

export async function refreshEpic7DbAvailability(): Promise<void> {
  if (!refreshEpic7DbPromise) {
    refreshEpic7DbPromise = runRefreshEpic7DbAvailability().finally(() => {
      refreshEpic7DbPromise = null;
    });
  }
  await refreshEpic7DbPromise;
}

export function isEpic7DbAvailable(): boolean {
  return epic7DbAvailable;
}
