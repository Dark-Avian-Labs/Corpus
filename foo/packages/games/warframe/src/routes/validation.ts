import { positiveInt, z } from '@corpus/core/validation';

export const updateSchema = z.object({
  row_id: positiveInt,
  column_id: positiveInt,
  value: z.string().trim().default(''),
});

export const addRowSchema = z.object({
  worksheet_id: positiveInt,
  item_name: z.string().trim().min(1, 'Item name is required.'),
  values: z.record(z.string(), z.string()).optional().default({}),
});

export const editRowSchema = z.object({
  row_id: positiveInt,
  item_name: z.string().trim().nullable().default(null),
  values: z.record(z.string(), z.string()).optional().default({}),
});

export const deleteRowSchema = z.object({
  row_id: positiveInt,
});

export const adminUpdateSchema = updateSchema;
