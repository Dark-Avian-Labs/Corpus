import type { Request, Response } from 'express';

/**
 * Extracts the `action` string from the request query or body.
 * Supports `?action=foo` (GET) and `{ "action": "foo" }` (POST body).
 */
export function getActionFromRequest(req: Request): string {
  const rawQuery = req.query?.action;
  const q = Array.isArray(rawQuery)
    ? String(rawQuery[0] ?? '')
    : typeof rawQuery === 'string'
      ? rawQuery
      : '';
  const b = typeof req.body?.action === 'string' ? req.body.action : '';
  return (q || b || '').trim();
}

/**
 * Convenience helpers for JSON API responses.
 */
export function createJsonHelpers(res: Response) {
  return {
    json(data: unknown, status = 200): Response {
      return res.status(status).json(data);
    },
    err(message: string, status = 400): Response {
      return res.status(status).json({ error: message });
    },
  };
}
