const DEFAULT_AUTH_HEALTH_TIMEOUT_MS = 3000;

export async function pingAuthServiceHealth(
  authServiceUrl: string,
  timeoutMs = DEFAULT_AUTH_HEALTH_TIMEOUT_MS,
): Promise<boolean> {
  const base = authServiceUrl.trim().replace(/\/+$/, '');
  if (!base) return false;
  if (!/^https?:\/\//i.test(base)) return false;
  try {
    new URL(base);
  } catch {
    return false;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${base}/healthz`, {
      method: 'GET',
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
