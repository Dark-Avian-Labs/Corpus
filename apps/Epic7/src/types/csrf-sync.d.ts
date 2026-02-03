declare module 'csrf-sync' {
  import type { RequestHandler } from 'express';

  interface CsrfSyncOptions {
    ignoredMethods?: string[];
    getTokenFromState?: (req: unknown) => string | undefined;
    getTokenFromRequest?: (req: unknown) => string | undefined;
    storeTokenInState?: (req: unknown, token: string) => void;
    size?: number;
  }

  interface CsrfSyncResult {
    csrfSynchronisedProtection: RequestHandler;
    generateToken: (req: unknown, overwrite?: boolean) => string;
    getToken: (req: unknown) => string | undefined;
    storeToken: (req: unknown, token: string) => void;
  }

  export function csrfSync(options?: CsrfSyncOptions): CsrfSyncResult;
}
