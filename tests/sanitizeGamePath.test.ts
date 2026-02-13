import { describe, expect, it } from 'vitest';

import { sanitizeGamePath } from '../src/sanitizeGamePath.js';

describe('sanitizeGamePath', () => {
  // --- valid relative paths ---
  it('allows root-relative path', () => {
    expect(sanitizeGamePath('/warframe')).toBe('/warframe');
  });

  it('allows deep root-relative path', () => {
    expect(sanitizeGamePath('/games/epic7/index')).toBe('/games/epic7/index');
  });

  it('allows dot-relative path', () => {
    expect(sanitizeGamePath('./warframe')).toBe('./warframe');
  });

  // --- valid absolute URLs ---
  it('allows https URL', () => {
    expect(sanitizeGamePath('https://example.com')).toBe('https://example.com');
  });

  it('allows http URL', () => {
    expect(sanitizeGamePath('http://example.com')).toBe('http://example.com');
  });

  it('is case-insensitive for protocol', () => {
    expect(sanitizeGamePath('HTTPS://example.com')).toBe('HTTPS://example.com');
  });

  // --- blocked / edge-case inputs ---
  it('blocks protocol-relative URL (//)', () => {
    expect(sanitizeGamePath('//evil.com')).toBe('#');
  });

  it('blocks javascript: protocol', () => {
    expect(sanitizeGamePath('javascript:alert(1)')).toBe('#');
  });

  it('blocks data: protocol', () => {
    expect(sanitizeGamePath('data:text/html,<h1>hi</h1>')).toBe('#');
  });

  it('blocks mixed-case javascript: protocol', () => {
    expect(sanitizeGamePath('JaVaScRiPt:alert(1)')).toBe('#');
  });

  it('blocks javascript: with embedded newline', () => {
    expect(sanitizeGamePath('java\nscript:alert(1)')).toBe('#');
  });

  it('blocks javascript: with embedded tab', () => {
    expect(sanitizeGamePath('javascript\t:alert(1)')).toBe('#');
  });

  it('blocks javascript: with embedded carriage return', () => {
    expect(sanitizeGamePath('javascript\r:alert(1)')).toBe('#');
  });

  it('blocks vbscript: protocol', () => {
    expect(sanitizeGamePath('vbscript:msgbox(1)')).toBe('#');
  });

  it('blocks file: protocol', () => {
    expect(sanitizeGamePath('file:///etc/passwd')).toBe('#');
  });

  it('blocks bare domain', () => {
    expect(sanitizeGamePath('evil.com')).toBe('#');
  });

  it('returns # for null', () => {
    expect(sanitizeGamePath(null)).toBe('#');
  });

  it('returns # for undefined', () => {
    expect(sanitizeGamePath(undefined)).toBe('#');
  });

  it('returns # for empty string', () => {
    expect(sanitizeGamePath('')).toBe('#');
  });

  it('returns # for whitespace-only', () => {
    expect(sanitizeGamePath('   ')).toBe('#');
  });

  it('trims whitespace from valid path', () => {
    expect(sanitizeGamePath('  /warframe  ')).toBe('/warframe');
  });
});
