import { describe, expect, it } from 'vitest';

import { resolveAdvancedProgressState } from '../packages/games/warframe/src/db/queries.js';

describe('Warframe advanced progress', () => {
  it('automatically completes Arcane for normal and prime Warframes', () => {
    const state = resolveAdvancedProgressState('Warframes', 'Excalibur', true, null, {
      has_arcane: false,
      has_arcane_prime: false,
    });

    expect(state.normal.has_arcane).toBe(true);
    expect(state.prime.has_arcane).toBe(true);
  });
});
