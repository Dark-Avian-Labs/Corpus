import { APP_ID } from '../../app/config';

export type AppRoleAssignment = { app_id: string; role: 'user' | 'admin' };

export function isCodexGameAdmin(
  user: { is_admin: boolean },
  appRoles: AppRoleAssignment[] | undefined,
): boolean {
  if (user.is_admin) return true;
  const forApp = appRoles?.find((role) => role.app_id === APP_ID);
  return forApp?.role === 'admin';
}
