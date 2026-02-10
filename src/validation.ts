import { flexBool, positiveInt, z } from '@corpus/core/validation';

// ---------------------------------------------------------------------------
// Root admin / auth request body schemas
// ---------------------------------------------------------------------------

export const loginSchema = z.object({
  username: z.string().trim().min(1, 'Username is required.'),
  password: z.string().min(1, 'Password is required.'),
  next: z.string().optional().default(''),
});

export const registerSchema = z
  .object({
    username: z.string().trim().min(1, 'Username is required.'),
    password: z.string().min(1, 'Password is required.'),
    confirm_password: z.string().min(1, 'Confirm password is required.'),
    is_admin: flexBool,
  })
  .refine((data) => data.password === data.confirm_password, {
    message: 'Passwords do not match',
    path: ['confirm_password'],
  });

export const gameAccessSchema = z.object({
  user_id: positiveInt,
  game_id: z.string().trim().min(1, 'game_id is required.'),
  enabled: flexBool,
});

export const deleteUserSchema = z.object({
  user_id: positiveInt,
});
