export {
  APP_NAME,
  AUTH_LOCKOUT_FILE,
  AUTH_MAX_ATTEMPTS,
  AUTH_LOCKOUT_MINUTES,
  CENTRAL_DB_PATH,
  COOKIE_DOMAIN,
  BASE_HOST,
  GAME_HOSTS,
} from './config.js';
export { createCentralSchema, getCentralDb } from './db/schema.js';
export type { CentralUser } from './db/queries.js';
export {
  getClientIP,
  isLockedOut,
  getLockoutRemaining,
  attemptLogin,
  createUser,
  deleteUser,
  changePassword,
  getAllUsers,
  getGamesForUser,
  hasAccess,
  grantGameAccess,
  setUserGameAccess,
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
} from './middleware/auth.js';
export type { GameModule, GameMountOptions } from './types/game.js';
