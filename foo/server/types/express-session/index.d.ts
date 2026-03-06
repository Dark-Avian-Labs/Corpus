import 'express-session';

declare module 'express-session' {
  interface SessionData {
    avatar?: number;
  }
}

export {};
