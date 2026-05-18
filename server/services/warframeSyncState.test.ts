import { describe, expect, it } from 'vitest';

import {
  isWarframeSyncRunning,
  runWarframeSyncGuarded,
  SyncAlreadyRunningError,
  waitForWarframeSyncIdle,
} from './warframeSyncState.js';

describe('runWarframeSyncGuarded', () => {
  it('keeps running true until an async callback completes', async () => {
    let runningDuringAsync = false;
    const result = await runWarframeSyncGuarded(async () => {
      runningDuringAsync = isWarframeSyncRunning();
      await Promise.resolve();
      return 'done';
    });
    expect(result).toBe('done');
    expect(runningDuringAsync).toBe(true);
    expect(isWarframeSyncRunning()).toBe(false);
  });

  it('rejects concurrent syncs', async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = runWarframeSyncGuarded(async () => {
      await gate;
      return 1;
    });
    await Promise.resolve();
    expect(isWarframeSyncRunning()).toBe(true);
    await expect(runWarframeSyncGuarded(async () => 2)).rejects.toBeInstanceOf(SyncAlreadyRunningError);
    release?.();
    await expect(first).resolves.toBe(1);
    expect(isWarframeSyncRunning()).toBe(false);
  });
});

describe('waitForWarframeSyncIdle', () => {
  it('resolves true immediately when no sync is running', async () => {
    await expect(waitForWarframeSyncIdle(100)).resolves.toBe(true);
  });

  it('resolves true when sync stops before timeout', async () => {
    const sync = runWarframeSyncGuarded(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    const idle = await waitForWarframeSyncIdle(500);
    await sync;
    expect(idle).toBe(true);
  });

  it('resolves false when sync does not finish in time', async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const sync = runWarframeSyncGuarded(async () => {
      await gate;
    });
    await Promise.resolve();
    await expect(waitForWarframeSyncIdle(30)).resolves.toBe(false);
    release?.();
    await sync;
  });
});
