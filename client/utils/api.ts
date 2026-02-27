let cachedToken: string | null = null;
let inFlightPromise: Promise<string | null> | null = null;

async function getCsrfToken(): Promise<string | null> {
  if (cachedToken !== null) {
    return cachedToken;
  }
  if (inFlightPromise !== null) {
    return await inFlightPromise;
  }

  inFlightPromise = (async () => {
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
    } finally {
      inFlightPromise = null;
    }
  })();

  const token = await inFlightPromise;
  if (token === null) {
    cachedToken = null;
  }
  return token;
}

export function clearCsrfToken(): void {
  cachedToken = null;
  inFlightPromise = null;
}

async function isCsrfFailureResponse(response: Response): Promise<boolean> {
  if (response.status === 403) {
    return true;
  }

  for (const [name, value] of response.headers.entries()) {
    const normalizedName = name.toLowerCase();
    if (
      normalizedName.includes('csrf') ||
      normalizedName.includes('xsrf') ||
      value.toLowerCase().includes('csrf') ||
      value.toLowerCase().includes('xsrf')
    ) {
      return true;
    }
  }

  try {
    const bodyText = (await response.clone().text()).toLowerCase();
    return bodyText.includes('csrf') || bodyText.includes('xsrf');
  } catch {
    return false;
  }
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

  const response = await fetch(url, { ...init, headers });
  if (!needsCsrf || !(await isCsrfFailureResponse(response))) {
    return response;
  }

  clearCsrfToken();
  const freshCsrfToken = await getCsrfToken();
  if (freshCsrfToken === null) {
    throw new Error('Failed to refresh CSRF token');
  }

  const retryHeaders = new Headers(init?.headers);
  retryHeaders.set('X-CSRF-Token', freshCsrfToken);
  return fetch(url, { ...init, headers: retryHeaders });
}
