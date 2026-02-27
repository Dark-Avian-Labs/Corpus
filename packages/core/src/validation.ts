import type { Response } from 'express';
import { z } from 'zod';

export { z };

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

export const positiveInt = z.coerce
  .number({ error: 'Must be a number' })
  .int({ error: 'Must be an integer' })
  .positive({ error: 'Must be greater than 0' });

export const optionalPositiveInt = z.preprocess(
  (v) => (v == null || v === '' ? null : v),
  z.coerce.number().int().positive().nullable(),
);

export const flexBool = z.preprocess((v) => {
  if (v === undefined || v === null) return false;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  const s = String(v).toLowerCase().trim();
  return s === 'true' || s === 'on' || s === '1';
}, z.boolean());

export function zodEnum<const T extends readonly string[]>(values: T) {
  return z.enum(values);
}
