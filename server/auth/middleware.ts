import {
  requireAuth as coreRequireAuth,
  requireAuthApi as coreRequireAuthApi,
  requireAdmin as coreRequireAdmin,
} from '@codex/core';

export const requireAuth = coreRequireAuth;
export const requireAuthApi = coreRequireAuthApi;
export const requireAdmin = coreRequireAdmin;
export const requireGameAdmin = coreRequireAdmin;
