import { positiveInt, z } from '@codex/core/validation';

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

export const updateAdvancedProgressSchema = z
  .object({
    row_id: positiveInt,
    level: z.number().int().min(0).max(40).optional(),
    level_prime: z.number().int().min(0).max(40).optional(),
    valence_percent: z.number().int().min(30).max(60).nullable().optional(),
    valence_percent_prime: z.number().int().min(30).max(60).nullable().optional(),
    has_element: z.boolean().optional(),
    has_element_prime: z.boolean().optional(),
    has_orokin: z.boolean().optional(),
    has_orokin_prime: z.boolean().optional(),
    has_arcane: z.boolean().optional(),
    has_arcane_prime: z.boolean().optional(),
    has_exilus: z.boolean().optional(),
    has_exilus_prime: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    if (
      value.level === undefined &&
      value.level_prime === undefined &&
      value.valence_percent === undefined &&
      value.valence_percent_prime === undefined &&
      value.has_element === undefined &&
      value.has_element_prime === undefined &&
      value.has_orokin === undefined &&
      value.has_orokin_prime === undefined &&
      value.has_arcane === undefined &&
      value.has_arcane_prime === undefined &&
      value.has_exilus === undefined &&
      value.has_exilus_prime === undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide at least one advanced progress field.',
      });
    }
  });
