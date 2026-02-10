import { describe, expect, it } from 'vitest';

import {
  addAccountSchema,
  addArtifactSchema,
  addHeroSchema,
  adminAddBaseArtifactSchema,
  adminAddBaseHeroSchema,
  adminDeleteBaseArtifactSchema,
  adminDeleteBaseHeroSchema,
  deleteAccountSchema,
  deleteArtifactSchema,
  deleteHeroSchema,
  switchAccountSchema,
  updateArtifactDetailsSchema,
  updateArtifactSchema,
  updateHeroDetailsSchema,
  updateHeroSchema,
} from '../packages/games/epic7/src/routes/validation.js';

describe('Epic7 validation schemas', () => {
  // ---------- updateHeroSchema ----------
  describe('updateHeroSchema', () => {
    it('accepts valid input', () => {
      const r = updateHeroSchema.safeParse({ hero_id: 1, rating: 'SSS' });
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.data.hero_id).toBe(1);
        expect(r.data.rating).toBe('SSS');
      }
    });

    it('accepts "-" rating', () => {
      const r = updateHeroSchema.safeParse({ hero_id: 1, rating: '-' });
      expect(r.success).toBe(true);
    });

    it('rejects invalid rating', () => {
      const r = updateHeroSchema.safeParse({ hero_id: 1, rating: 'X' });
      expect(r.success).toBe(false);
    });

    it('rejects non-positive hero_id', () => {
      const r = updateHeroSchema.safeParse({ hero_id: 0, rating: 'A' });
      expect(r.success).toBe(false);
    });

    it('coerces string hero_id', () => {
      const r = updateHeroSchema.safeParse({ hero_id: '5', rating: 'S' });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.hero_id).toBe(5);
    });
  });

  // ---------- updateArtifactSchema ----------
  describe('updateArtifactSchema', () => {
    it('accepts valid input', () => {
      const r = updateArtifactSchema.safeParse({
        artifact_id: 3,
        gauge_level: 5,
      });
      expect(r.success).toBe(true);
    });

    it('rejects gauge_level > 5', () => {
      const r = updateArtifactSchema.safeParse({
        artifact_id: 3,
        gauge_level: 6,
      });
      expect(r.success).toBe(false);
    });

    it('accepts gauge_level 0', () => {
      const r = updateArtifactSchema.safeParse({
        artifact_id: 3,
        gauge_level: 0,
      });
      expect(r.success).toBe(true);
    });
  });

  // ---------- addHeroSchema ----------
  describe('addHeroSchema', () => {
    it('accepts valid hero', () => {
      const r = addHeroSchema.safeParse({
        name: 'Arby',
        class: 'thief',
        element: 'dark',
        star_rating: 5,
      });
      expect(r.success).toBe(true);
    });

    it('defaults star_rating to 5', () => {
      const r = addHeroSchema.safeParse({
        name: 'Arby',
        class: 'thief',
        element: 'dark',
      });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.star_rating).toBe(5);
    });

    it('rejects empty name', () => {
      const r = addHeroSchema.safeParse({
        name: '  ',
        class: 'thief',
        element: 'dark',
      });
      expect(r.success).toBe(false);
    });

    it('rejects invalid class', () => {
      const r = addHeroSchema.safeParse({
        name: 'Test',
        class: 'berserker',
        element: 'dark',
      });
      expect(r.success).toBe(false);
    });

    it('rejects invalid element', () => {
      const r = addHeroSchema.safeParse({
        name: 'Test',
        class: 'warrior',
        element: 'wind',
      });
      expect(r.success).toBe(false);
    });

    it('accepts null base_hero_id', () => {
      const r = addHeroSchema.safeParse({
        name: 'Test',
        class: 'warrior',
        element: 'fire',
        base_hero_id: null,
      });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.base_hero_id).toBeNull();
    });
  });

  // ---------- addArtifactSchema ----------
  describe('addArtifactSchema', () => {
    it('accepts valid artifact (including universal class)', () => {
      const r = addArtifactSchema.safeParse({
        name: 'Proof of Valor',
        class: 'universal',
        star_rating: 5,
      });
      expect(r.success).toBe(true);
    });

    it('rejects star_rating > 5', () => {
      const r = addArtifactSchema.safeParse({
        name: 'Test',
        class: 'warrior',
        star_rating: 6,
      });
      expect(r.success).toBe(false);
    });
  });

  // ---------- delete schemas ----------
  describe('deleteHeroSchema', () => {
    it('accepts positive integer', () => {
      expect(deleteHeroSchema.safeParse({ hero_id: 1 }).success).toBe(true);
    });
    it('rejects zero', () => {
      expect(deleteHeroSchema.safeParse({ hero_id: 0 }).success).toBe(false);
    });
  });

  describe('deleteArtifactSchema', () => {
    it('accepts positive integer', () => {
      expect(deleteArtifactSchema.safeParse({ artifact_id: 1 }).success).toBe(
        true,
      );
    });
  });

  // ---------- detail update schemas ----------
  describe('updateHeroDetailsSchema', () => {
    it('accepts valid full update', () => {
      const r = updateHeroDetailsSchema.safeParse({
        hero_id: 1,
        name: 'New Name',
        class: 'mage',
        element: 'ice',
        star_rating: 4,
      });
      expect(r.success).toBe(true);
    });
  });

  describe('updateArtifactDetailsSchema', () => {
    it('accepts valid full update', () => {
      const r = updateArtifactDetailsSchema.safeParse({
        artifact_id: 2,
        name: 'New Artifact',
        class: 'soulweaver',
        star_rating: 3,
      });
      expect(r.success).toBe(true);
    });
  });

  // ---------- account schemas ----------
  describe('switchAccountSchema', () => {
    it('accepts valid account_id', () => {
      expect(switchAccountSchema.safeParse({ account_id: 5 }).success).toBe(
        true,
      );
    });
  });

  describe('addAccountSchema', () => {
    it('accepts valid name', () => {
      const r = addAccountSchema.safeParse({ account_name: 'Main' });
      expect(r.success).toBe(true);
    });
    it('rejects blank name', () => {
      expect(addAccountSchema.safeParse({ account_name: '' }).success).toBe(
        false,
      );
    });
  });

  describe('deleteAccountSchema', () => {
    it('accepts valid account_id', () => {
      expect(deleteAccountSchema.safeParse({ account_id: 1 }).success).toBe(
        true,
      );
    });
  });

  // ---------- admin base-data schemas ----------
  describe('adminAddBaseHeroSchema', () => {
    it('accepts valid base hero', () => {
      const r = adminAddBaseHeroSchema.safeParse({
        name: 'Ras',
        class: 'knight',
        element: 'fire',
        star_rating: 3,
      });
      expect(r.success).toBe(true);
    });
  });

  describe('adminAddBaseArtifactSchema', () => {
    it('accepts valid base artifact', () => {
      const r = adminAddBaseArtifactSchema.safeParse({
        name: 'Daydream Joker',
        class: 'universal',
        star_rating: 3,
      });
      expect(r.success).toBe(true);
    });
  });

  describe('adminDeleteBaseHeroSchema', () => {
    it('accepts valid hero_id', () => {
      expect(adminDeleteBaseHeroSchema.safeParse({ hero_id: 10 }).success).toBe(
        true,
      );
    });
  });

  describe('adminDeleteBaseArtifactSchema', () => {
    it('accepts valid artifact_id', () => {
      expect(
        adminDeleteBaseArtifactSchema.safeParse({ artifact_id: 10 }).success,
      ).toBe(true);
    });
  });
});
