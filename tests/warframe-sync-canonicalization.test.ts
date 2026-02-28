import { describe, expect, it } from 'vitest';
import {
  isPrimeVariantName,
  normalizeDisplayName,
  resolveCanonicalKey,
  stripPrimeSuffix,
} from '../server/services/warframeSyncNaming.js';

describe('warframe sync canonicalization', () => {
  it('strips archwing prefix and prime suffix for canonical key', () => {
    expect(normalizeDisplayName('<ARCHWING> Odonata Prime')).toBe(
      'Odonata Prime',
    );
    expect(resolveCanonicalKey('<ARCHWING> Odonata Prime')).toBe('odonata');
  });

  it('keeps Excalibur and Excalibur Umbra as distinct canonical names', () => {
    expect(resolveCanonicalKey('Excalibur Prime')).toBe('excalibur');
    expect(resolveCanonicalKey('Excalibur Umbra Prime')).toBe(
      'excalibur umbra',
    );
    expect(resolveCanonicalKey('Excalibur Umbra')).toBe('excalibur umbra');
  });

  it('normalizes known mode qualifiers', () => {
    expect(normalizeDisplayName('Hate (Heavy Scythe)')).toBe('Hate');
    expect(normalizeDisplayName('Skana (Dual Blade)')).toBe('Skana');
  });

  it('strips prime suffix while preserving base identity', () => {
    expect(stripPrimeSuffix('Braton Prime')).toBe('Braton');
    expect(stripPrimeSuffix('Excalibur Umbra Prime')).toBe('Excalibur Umbra');
  });

  it('detects prime variant names', () => {
    expect(isPrimeVariantName('Gotva Prime')).toBe(true);
    expect(isPrimeVariantName('<ARCHWING> Odonata Prime')).toBe(true);
    expect(isPrimeVariantName('Gotva')).toBe(false);
  });
});
