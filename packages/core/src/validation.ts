import type { Response } from 'express';
import { z } from 'zod';

// Re-export z so consumers can import { z } from '@corpus/core/validation'
// instead of depending on zod directly.
export { z };

/**
 * Validate an unknown value against a Zod schema.
 * On success, returns the parsed (and possibly transformed) data.
 * On failure, sends a 400 JSON error response and returns `null`.
 */
export function validateBody<T extends z.ZodType>(
  schema: T,
  body: unknown,
  res: Response,
): z.infer<T> | null {
  const result = schema.safeParse(body);
  if (!result.success) {
    const flat = z.flattenError(result.error);
    res.status(400).json({
      error: 'Validation failed',
      details: flat.fieldErrors,
    });
    return null;
  }
  return result.data;
}

// ---------------------------------------------------------------------------
// Reusable schema building blocks
// ---------------------------------------------------------------------------

/** Coerce an input to a positive integer (> 0). */
export const positiveInt = z.coerce
  .number({ error: 'Must be a number' })
  .int({ error: 'Must be an integer' })
  .positive({ error: 'Must be greater than 0' });

/**
 * Coerce to a positive integer, or `null` when the value is null / undefined / ''.
 * Useful for optional foreign-key references.
 */
export const optionalPositiveInt = z.preprocess(
  (v) => (v == null || v === '' ? null : v),
  z.coerce.number().int().positive().nullable(),
);

/**
 * Accept boolean-ish values from forms (boolean, number, or common string representations)
 * and normalise to a strict `boolean`.
 */
export const flexBool = z.preprocess((v) => {
  if (v === undefined || v === null) return false;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  const s = String(v).toLowerCase().trim();
  return s === 'true' || s === 'on' || s === '1';
}, z.boolean());

/**
 * Helper: create a `z.enum()` from a `readonly string[]`.
 */
export function zodEnum<const T extends readonly string[]>(values: T) {
  return z.enum(values);
}
