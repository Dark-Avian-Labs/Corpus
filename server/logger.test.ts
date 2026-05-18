import { afterEach, describe, expect, it, vi } from 'vitest';

import { log } from './logger.js';

describe('logger', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes JSON lines to console', () => {
    const infoSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    log('info', 'hello', { key: 'value' });
    expect(infoSpy).toHaveBeenCalledOnce();
    const line = JSON.parse(String(infoSpy.mock.calls[0]?.[0])) as {
      level: string;
      msg: string;
      key: string;
    };
    expect(line.level).toBe('info');
    expect(line.msg).toBe('hello');
    expect(line.key).toBe('value');
  });

  it('routes error to console.error', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    log('error', 'boom');
    expect(errorSpy).toHaveBeenCalledOnce();
    const line = JSON.parse(String(errorSpy.mock.calls[0]?.[0])) as { level: string; msg: string };
    expect(line.level).toBe('error');
    expect(line.msg).toBe('boom');
  });

  it('routes warn to console.warn', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    log('warn', 'careful');
    expect(warnSpy).toHaveBeenCalledOnce();
    const line = JSON.parse(String(warnSpy.mock.calls[0]?.[0])) as { level: string; msg: string };
    expect(line.level).toBe('warn');
    expect(line.msg).toBe('careful');
  });

  it('routes debug to console.log', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    log('debug', 'trace');
    expect(logSpy).toHaveBeenCalledOnce();
    const line = JSON.parse(String(logSpy.mock.calls[0]?.[0])) as { level: string; msg: string };
    expect(line.level).toBe('debug');
    expect(line.msg).toBe('trace');
  });

  it('includes an ISO ts field on info logs', () => {
    const infoSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    log('info', 'timestamped');
    const line = JSON.parse(String(infoSpy.mock.calls[0]?.[0])) as { ts: string };
    expect(line.ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('does not let caller fields override ts, level, or msg', () => {
    const infoSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    log('info', 'real message', {
      ts: 'spoofed-ts',
      level: 'error',
      msg: 'spoofed-msg',
      requestId: 'abc',
    });

    const line = JSON.parse(String(infoSpy.mock.calls[0]?.[0])) as {
      ts: string;
      level: string;
      msg: string;
      requestId: string;
    };
    expect(line.msg).toBe('real message');
    expect(line.level).toBe('info');
    expect(line.ts).not.toBe('spoofed-ts');
    expect(line.requestId).toBe('abc');
  });
});
