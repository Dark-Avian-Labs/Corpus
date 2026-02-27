let cachedToken: string | null = null;

async function getCsrfToken(): Promise<string | null> {
  if (cachedToken !== null) {
    return cachedToken;
  }
  try {
    const res = await fetch('/api/auth/csrf');
    if (!res.ok) {
      return null;
    }
    const body = (await res.json()) as { csrfToken?: string };
    if (!body.csrfToken) {
      return null;
    }
    cachedToken = body.csrfToken;
    return body.csrfToken;
  } catch {
    return null;
  }
}

export function clearCsrfToken(): void {
  cachedToken = null;
}

export async function apiFetch(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  const method = (init?.method ?? 'GET').toUpperCase();
  const needsCsrf =
    method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS';

  const headers = new Headers(init?.headers);
  if (needsCsrf) {
    const csrfToken = await getCsrfToken();
    if (csrfToken === null) {
      throw new Error('Failed to fetch CSRF token');
    }
    headers.set('X-CSRF-Token', csrfToken);
  }

  return fetch(url, { ...init, headers });
}
