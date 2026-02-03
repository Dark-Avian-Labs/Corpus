import 'express-session';

declare module 'express-session' {
  interface SessionData {
    user_id?: number;
    username?: string;
    is_admin?: boolean;
    csrfToken?: string;
    login_time?: number;
    account_id?: number | null;
    account_name?: string | null;
  }
}
