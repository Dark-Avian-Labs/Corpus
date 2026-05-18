import { randomUUID } from 'node:crypto';

import type { Request, Response, NextFunction } from 'express';

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers['x-request-id'];
  const requestId =
    typeof incoming === 'string' && incoming.trim().length > 0 ? incoming.trim() : randomUUID();
  res.locals.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
}

export function getRequestId(res: Response): string | undefined {
  const id = res.locals.requestId;
  return typeof id === 'string' && id.length > 0 ? id : undefined;
}
