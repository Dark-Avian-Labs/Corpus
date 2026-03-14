import { config as loadEnv } from '@dotenvx/dotenvx';
import fs from 'fs';
import path from 'path';

function getPrivateKeyEnvName(envFile: string): string | null {
  const match = envFile.match(/^\.env\.(.+)$/);
  if (!match) {
    return null;
  }
  const suffix = match[1].replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
  return suffix ? `DOTENV_PRIVATE_KEY_${suffix}` : null;
}

function isEncryptedEnvFile(envPath: string): boolean {
  try {
    const preview = fs.readFileSync(envPath, 'utf8').slice(0, 2048);
    return (
      preview.includes('DOTENV_PUBLIC_KEY_') || preview.includes('encrypted:')
    );
  } catch {
    return false;
  }
}

const testEnvCandidates = ['.env.test', '.env.development', '.env'];
for (const envFile of testEnvCandidates) {
  const envPath = path.join(process.cwd(), envFile);
  if (!fs.existsSync(envPath)) {
    continue;
  }
  const encrypted = isEncryptedEnvFile(envPath);
  const keyEnvName = getPrivateKeyEnvName(envFile);
  const hasGlobalKey = Boolean(process.env.DOTENV_PRIVATE_KEY?.trim());
  const hasScopedKey = keyEnvName
    ? Boolean(process.env[keyEnvName]?.trim())
    : false;
  const hasKeysFile = fs.existsSync(path.join(process.cwd(), '.env.keys'));
  if (encrypted && !hasGlobalKey && !hasScopedKey && !hasKeysFile) {
    console.warn(
      `[Test Setup] Skipping encrypted env file "${envPath}" because no dotenv private key was found (${keyEnvName ?? 'DOTENV_PRIVATE_KEY'}).`,
    );
    continue;
  }
  try {
    loadEnv({ path: envPath });
  } catch (error) {
    console.error(
      `[Test Setup] Failed to load environment via loadEnv from "${envPath}".`,
      error,
    );
    throw error;
  }
  break;
}

process.env.NODE_ENV ??= 'test';
process.env.APP_PUBLIC_BASE_URL ??= 'https://corpus.example.test';
process.env.AUTH_SERVICE_URL ??= 'https://auth.example.test';
process.env.COOKIE_DOMAIN ??= '.example.test';
process.env.BASE_HOST ??= 'corpus.example.test';
process.env.BASE_DOMAIN ??= 'example.test';
process.env.BASE_PROTOCOL ??= 'https';
process.env.APP_SUBDOMAIN ??= 'corpus';
process.env.CENTRAL_DB_PATH ??= path.join(
  process.cwd(),
  'data',
  'central.test.db',
);
process.env.PARAMETRIC_DB_PATH ??= path.join(
  process.cwd(),
  'data',
  'parametric.test.db',
);
process.env.SESSION_SECRET ??= 'test-session-secret-32-characters-min';
