import {
  VALENCE_COMPLETE_THRESHOLD,
  VALENCE_PERCENT_MAX_STORED,
  VALENCE_PERCENT_MIN,
  warframeQueries,
} from '@codex/game-warframe';
import { describe, expect, it } from 'vitest';

const { resolveAdvancedProgressState } = warframeQueries;

function baseRow(overrides: Partial<Record<string, number | null>> = {}) {
  return {
    row_id: 1,
    level: 15,
    level_prime: 10,
    valence_percent: null as number | null,
    valence_percent_prime: null as number | null,
    has_element: 1,
    has_element_prime: 0,
    has_orokin: 1,
    has_orokin_prime: 1,
    has_arcane: 0,
    has_arcane_prime: 0,
    has_exilus: 1,
    has_exilus_prime: 0,
    ...overrides,
  };
}

describe('Warframe advanced progress', () => {
  it('automatically completes Arcane for normal and prime Warframes', () => {
    const state = resolveAdvancedProgressState('Warframes', 'Excalibur', true, null, {
      has_arcane: false,
      has_arcane_prime: false,
    });

    expect(state.normal.has_arcane).toBe(true);
    expect(state.prime.has_arcane).toBe(true);
  });

  it('does not auto-complete Orokin for prime Warframe variants', () => {
    const state = resolveAdvancedProgressState('Warframes', 'Excalibur', true, null, {
      has_orokin: false,
      has_orokin_prime: false,
    });
    expect(state.normal.has_orokin).toBe(false);
    expect(state.prime.has_orokin).toBe(false);
  });

  it('auto-completes Orokin on normal and prime for exalted weapons', () => {
    const state = resolveAdvancedProgressState('Melee Weapons', 'Exalted Blade', true, null, {
      has_orokin: false,
      has_orokin_prime: false,
    });
    expect(state.normal.has_orokin).toBe(true);
    expect(state.prime.has_orokin).toBe(true);
    expect(state.relevance.normal.auto_orokin).toBe(true);
    expect(state.relevance.prime.auto_orokin).toBe(true);
  });

  it('does not auto-complete Orokin on ordinary prime weapons', () => {
    const state = resolveAdvancedProgressState('Primary Weapons', 'Braton', true, null, {
      has_orokin: false,
      has_orokin_prime: false,
    });
    expect(state.normal.has_orokin).toBe(false);
    expect(state.prime.has_orokin).toBe(false);
  });

  it('does not force arcane via autoArcane on non-Warframe worksheets when patch turns it off', () => {
    const autoWarframe = resolveAdvancedProgressState('Warframes', 'Excalibur', true, null, {
      has_arcane: false,
    });
    expect(autoWarframe.normal.has_arcane).toBe(true);

    const manualWeapon = resolveAdvancedProgressState('Primary Weapons', 'Boltor', false, null, {
      has_arcane: false,
    });
    expect(manualWeapon.normal.has_arcane).toBe(false);
  });

  it('clears arcane when not relevant for the worksheet (Companions)', () => {
    const state = resolveAdvancedProgressState('Companions', 'Helios', false, null, { has_arcane: true });
    expect(state.normal.has_arcane).toBe(false);
  });

  it('clears stored arcane when autoArcane does not apply and arcane is irrelevant', () => {
    const current = baseRow({ has_arcane: 1 });
    const state = resolveAdvancedProgressState('Companions', 'Helios', false, current, {});
    expect(state.normal.has_arcane).toBe(false);
  });

  it('leaves unrelated advanced fields unchanged when only element is patched (non-Warframe)', () => {
    const current = baseRow();
    const next = resolveAdvancedProgressState('Primary Weapons', 'Boltor', false, current, { has_element: false });

    expect(next.normal.level).toBe(15);
    expect(next.prime.level).toBe(10);
    expect(next.normal.valence_percent).toBe(null);
    expect(next.normal.has_orokin).toBe(true);
    expect(next.normal.has_arcane).toBe(false);
    expect(next.normal.has_exilus).toBe(true);
  });

  describe('valence_percent normalization (Kuva / Tenet)', () => {
    it.each([
      { input: 57, expected: 57, note: 'below complete threshold stays clamped value' },
      { input: VALENCE_COMPLETE_THRESHOLD, expected: VALENCE_PERCENT_MAX_STORED, note: 'at threshold snaps to max' },
      { input: 59, expected: VALENCE_PERCENT_MAX_STORED, note: 'between threshold and max snaps to max' },
      { input: VALENCE_PERCENT_MAX_STORED, expected: VALENCE_PERCENT_MAX_STORED, note: 'already max stays max' },
      { input: 24, expected: VALENCE_PERCENT_MIN, note: 'below min clamps then stays below threshold' },
      { input: 61, expected: VALENCE_PERCENT_MAX_STORED, note: 'above max clamps to max' },
    ])('$note ($input -> $expected)', ({ input, expected }) => {
      const state = resolveAdvancedProgressState('Primary Weapons', 'Kuva Bramma', false, null, {
        valence_percent: input,
      });
      expect(state.normal.valence_percent).toBe(expected);
    });
  });
});
