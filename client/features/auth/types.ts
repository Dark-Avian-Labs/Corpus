export interface UserSummary {
  id: number;
  username: string;
  is_admin: boolean;
  avatar: number;
  app: string;
}

export interface AppSummary {
  id: string;
  label: string;
  subtitle: string;
  url: string;
}

export type AuthState =
  | { status: 'loading'; user: null; apps: AppSummary[] }
  | { status: 'unauthenticated'; user: null; apps: AppSummary[] }
  | { status: 'ok'; user: UserSummary; apps: AppSummary[] }
  | { status: 'error'; user: null; apps: AppSummary[] };
