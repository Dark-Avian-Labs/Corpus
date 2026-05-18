import { EventEmitter } from 'node:events';

let running = false;
const syncStateEmitter = new EventEmitter();

export class SyncAlreadyRunningError extends Error {
  constructor(message = 'A Warframe sync is already running.') {
    super(message);
    this.name = 'SyncAlreadyRunningError';
  }
}

export function isWarframeSyncRunning(): boolean {
  return running;
}

export async function runWarframeSyncGuarded<T>(fn: () => T | Promise<T>): Promise<T> {
  if (running) {
    throw new SyncAlreadyRunningError();
  }
  running = true;
  try {
    return await Promise.resolve(fn());
  } finally {
    running = false;
    syncStateEmitter.emit('stopped');
  }
}

export function waitForWarframeSyncIdle(timeoutMs: number): Promise<boolean> {
  if (!running) {
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const finish = (idle: boolean) => {
      if (settled) return;
      settled = true;
      syncStateEmitter.off('stopped', onStopped);
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      resolve(idle);
    };

    const onStopped = () => {
      if (!running) {
        finish(true);
      }
    };

    syncStateEmitter.on('stopped', onStopped);

    if (!running) {
      finish(true);
      return;
    }

    timeoutId = setTimeout(() => {
      finish(!running);
    }, timeoutMs);
  });
}
