import { describe, expect, it } from 'vitest';

import {
  addRowSchema,
  adminUpdateSchema,
  deleteRowSchema,
  editRowSchema,
  updateSchema,
} from '../packages/games/warframe/src/routes/validation.js';

describe('Warframe validation schemas', () => {
  // ---------- updateSchema ----------
  describe('updateSchema', () => {
    it('accepts valid input', () => {
      const r = updateSchema.safeParse({
        row_id: 1,
        column_id: 2,
        value: 'Obtained',
      });
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.data.row_id).toBe(1);
        expect(r.data.column_id).toBe(2);
        expect(r.data.value).toBe('Obtained');
      }
    });

    it('defaults empty value to ""', () => {
      const r = updateSchema.safeParse({ row_id: 1, column_id: 2 });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.value).toBe('');
    });

    it('trims value', () => {
      const r = updateSchema.safeParse({
        row_id: 1,
        column_id: 2,
        value: '  Complete  ',
      });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.value).toBe('Complete');
    });

    it('rejects non-positive row_id', () => {
      expect(
        updateSchema.safeParse({ row_id: 0, column_id: 1, value: '' }).success,
      ).toBe(false);
    });

    it('coerces string IDs', () => {
      const r = updateSchema.safeParse({
        row_id: '3',
        column_id: '7',
        value: '',
      });
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.data.row_id).toBe(3);
        expect(r.data.column_id).toBe(7);
      }
    });
  });

  // ---------- addRowSchema ----------
  describe('addRowSchema', () => {
    it('accepts valid input', () => {
      const r = addRowSchema.safeParse({
        worksheet_id: 1,
        item_name: 'Excalibur',
        values: { '1': 'Obtained' },
      });
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.data.item_name).toBe('Excalibur');
        expect(r.data.values).toEqual({ '1': 'Obtained' });
      }
    });

    it('defaults values to empty object', () => {
      const r = addRowSchema.safeParse({
        worksheet_id: 1,
        item_name: 'Mag',
      });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.values).toEqual({});
    });

    it('rejects empty item_name', () => {
      expect(
        addRowSchema.safeParse({ worksheet_id: 1, item_name: '' }).success,
      ).toBe(false);
    });

    it('rejects non-positive worksheet_id', () => {
      expect(
        addRowSchema.safeParse({ worksheet_id: -1, item_name: 'Test' }).success,
      ).toBe(false);
    });
  });

  // ---------- editRowSchema ----------
  describe('editRowSchema', () => {
    it('accepts valid input', () => {
      const r = editRowSchema.safeParse({
        row_id: 5,
        item_name: 'Rhino',
        values: {},
      });
      expect(r.success).toBe(true);
    });

    it('accepts null item_name', () => {
      const r = editRowSchema.safeParse({ row_id: 5, item_name: null });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.item_name).toBeNull();
    });

    it('defaults item_name to null when absent', () => {
      const r = editRowSchema.safeParse({ row_id: 5 });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.item_name).toBeNull();
    });
  });

  // ---------- deleteRowSchema ----------
  describe('deleteRowSchema', () => {
    it('accepts positive row_id', () => {
      expect(deleteRowSchema.safeParse({ row_id: 10 }).success).toBe(true);
    });

    it('rejects zero', () => {
      expect(deleteRowSchema.safeParse({ row_id: 0 }).success).toBe(false);
    });
  });

  // ---------- adminUpdateSchema ----------
  describe('adminUpdateSchema', () => {
    it('accepts valid input', () => {
      const r = adminUpdateSchema.safeParse({
        row_id: 1,
        column_id: 2,
        value: 'Unavailable',
      });
      expect(r.success).toBe(true);
    });
  });
});
