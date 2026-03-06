import { describe, expect, it } from 'vitest';

import { escapeHtml } from '../src/escapeHtml.js';

describe('escapeHtml', () => {
  it('escapes ampersand', () => {
    expect(escapeHtml('a&b')).toBe('a&amp;b');
  });

  it('escapes less-than', () => {
    expect(escapeHtml('a<b')).toBe('a&lt;b');
  });

  it('escapes greater-than', () => {
    expect(escapeHtml('a>b')).toBe('a&gt;b');
  });

  it('escapes double-quote', () => {
    expect(escapeHtml('a"b')).toBe('a&quot;b');
  });

  it('escapes single-quote', () => {
    expect(escapeHtml("a'b")).toBe('a&#39;b');
  });

  it('handles null → empty string', () => {
    expect(escapeHtml(null)).toBe('');
  });

  it('handles undefined → empty string', () => {
    expect(escapeHtml(undefined)).toBe('');
  });

  it('handles number coercion', () => {
    expect(escapeHtml(42)).toBe('42');
  });

  it('handles empty string', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('escapes a full script injection', () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;',
    );
  });

  it('escapes all special chars in one string', () => {
    expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
  });

  it('leaves plain text unchanged', () => {
    expect(escapeHtml('Hello World')).toBe('Hello World');
  });
});
