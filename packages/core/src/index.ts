export { log, type LogLevel } from './logger.js';
export {
  APP_NAME,
  CODEX_APP_ID,
  resolveEnvFilePath,
  CENTRAL_DB_PATH,
  COOKIE_DOMAIN,
  BASE_HOST,
  GAME_HOSTS,
  AUTH_SERVICE_URL,
} from './config.js';
export { createCentralSchema, getCentralDb, closeCentralDb } from './db/schema.js';
export {
  getGamesForUser,
  hasAccess,
  grantGameAccess,
  setUserGameAccess,
  getAllUsers,
  isAuthenticated,
  isAdmin,
} from './auth.js';
export type { AuthSession } from './auth.js';
export {
  requireAuth,
  requireAdmin,
  requireGameAccess,
  requireAuthApi,
  redirectIfAuthenticated,
  syncSessionFromAuth,
  effectiveAppAdmin,
} from './middleware/auth.js';
export type { RemoteAuthState } from './middleware/auth.js';
export { getAppPublicBaseUrl } from './middleware/appPublicBaseUrl.js';
export type { GameModule, GameMountOptions, GameTheme } from './types/game.js';
export { createDbSingleton } from './db/singleton.js';
export type { DbSingleton, DbSingletonOptions } from './db/singleton.js';
