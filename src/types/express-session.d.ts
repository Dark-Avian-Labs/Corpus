import 'express-session';

declare module 'express-session' {
  interface SessionData {
    user_id?: number;
    username?: string;
    is_admin?: boolean;
    account_id?: number | null;
    account_name?: string | null;
    login_time?: number;
  }
}
