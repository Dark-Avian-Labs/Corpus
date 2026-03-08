export interface UserSummary {
  id: number;
  username: string;
  isAdmin: boolean;
  avatar: number;
  app: string;
}

export interface AppSummary {
  id: string;
  label: string;
  subtitle: string;
  url: string;
}

export type AuthErrorDetail =
  | Error
  | string
  | { message: string; code?: string };

export type AuthState =
  | { status: 'loading'; user: null; apps: AppSummary[] }
  | { status: 'unauthenticated'; user: null; apps: AppSummary[] }
  | { status: 'forbidden'; user: null; apps: AppSummary[] }
  | {
      status: 'rate_limited';
      user: null;
      apps: AppSummary[];
      rateLimitedUntilMs: number;
    }
  | { status: 'ok'; user: UserSummary; apps: AppSummary[] }
  | { status: 'error'; user: null; apps: AppSummary[]; error: AuthErrorDetail };
