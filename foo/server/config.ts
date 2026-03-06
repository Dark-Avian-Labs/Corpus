import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

export const DATA_DIR = path.join(PROJECT_ROOT, 'data');
function requireAbsolutePathEnv(
  name: 'CENTRAL_DB_PATH' | 'PARAMETRIC_DB_PATH',
): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} must be set to an absolute shared SQLite path.`);
  }
  if (!path.isAbsolute(value)) {
    throw new Error(
      `${name} must be absolute; relative sibling paths are not supported.`,
    );
  }
  return value;
}

export const CENTRAL_DB_PATH = requireAbsolutePathEnv('CENTRAL_DB_PATH');
export const PARAMETRIC_DB_PATH = requireAbsolutePathEnv('PARAMETRIC_DB_PATH');

const _port = parseInt(process.env.PORT || '3001', 10);
export const PORT = Number.isFinite(_port) && _port > 0 ? _port : 3001;
export const HOST = process.env.HOST || '0.0.0.0';
export const APP_NAME = process.env.APP_NAME?.trim() || 'Corpus';
export const APP_ID = process.env.APP_ID?.trim() || 'corpus';
export const NODE_ENV = process.env.NODE_ENV || 'production';

export const SESSION_SECRET = process.env.SESSION_SECRET?.trim() || '';
if (SESSION_SECRET.length < 32) {
  throw new Error('SESSION_SECRET must be set and at least 32 characters.');
}

function parseBooleanEnv(value: string | undefined): boolean | undefined {
  if (value == null) return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') return true;
  if (normalized === 'false' || normalized === '0') return false;
  return undefined;
}

export const TRUST_PROXY = parseBooleanEnv(process.env.TRUST_PROXY) ?? false;
export const SECURE_COOKIES =
  parseBooleanEnv(process.env.SECURE_COOKIES) ?? NODE_ENV === 'production';
const ALLOWED_PROTOCOLS = ['http', 'https'] as const;
type AllowedProtocol = (typeof ALLOWED_PROTOCOLS)[number];

function validateBaseProtocol(value: string | undefined): AllowedProtocol {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return 'https';
  if (ALLOWED_PROTOCOLS.includes(normalized as AllowedProtocol)) {
    return normalized as AllowedProtocol;
  }

  console.warn(
    `Invalid BASE_PROTOCOL "${value}" provided; falling back to "https".`,
  );
  return 'https';
}

export const BASE_PROTOCOL = validateBaseProtocol(process.env.BASE_PROTOCOL);

export const BASE_DOMAIN = process.env.BASE_DOMAIN?.trim().toLowerCase() || '';
if (!BASE_DOMAIN) {
  throw new Error('BASE_DOMAIN must be set.');
}
const DOMAIN_LABEL_REGEX = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
function isValidDomain(domain: string): boolean {
  const domainLabels = domain.split('.');
  return (
    domain.length <= 253 &&
    domainLabels.length >= 2 &&
    domainLabels.every(
      (label) =>
        label.length >= 1 &&
        label.length <= 63 &&
        DOMAIN_LABEL_REGEX.test(label),
    ) &&
    domainLabels[domainLabels.length - 1].length >= 2
  );
}

const hasValidBaseDomain = isValidDomain(BASE_DOMAIN);
if (!hasValidBaseDomain) {
  throw new Error('BASE_DOMAIN must be a valid domain.');
}

export const APP_SUBDOMAIN =
  process.env.APP_SUBDOMAIN?.trim().toLowerCase() || APP_ID;
if (!DOMAIN_LABEL_REGEX.test(APP_SUBDOMAIN)) {
  throw new Error('APP_SUBDOMAIN is invalid.');
}

export const APP_PUBLIC_BASE_URL = `${BASE_PROTOCOL}://${APP_SUBDOMAIN}.${BASE_DOMAIN}`;
const configuredCookieDomain =
  process.env.COOKIE_DOMAIN?.trim().toLowerCase() || '';
let resolvedCookieDomain = `.${BASE_DOMAIN}`;

if (configuredCookieDomain) {
  const cookieDomainWithoutDot = configuredCookieDomain.replace(/^\./, '');
  if (!isValidDomain(cookieDomainWithoutDot)) {
    console.warn(
      `Invalid COOKIE_DOMAIN "${configuredCookieDomain}" provided; falling back to ".${BASE_DOMAIN}".`,
    );
  } else {
    resolvedCookieDomain = `.${cookieDomainWithoutDot}`;
  }
}

export const COOKIE_DOMAIN = resolvedCookieDomain;

export const AUTH_SERVICE_URL =
  process.env.AUTH_SERVICE_URL?.trim().replace(/\/+$/, '') || '';
if (!AUTH_SERVICE_URL || !AUTH_SERVICE_URL.startsWith('https://')) {
  throw new Error('AUTH_SERVICE_URL must be set and use https://');
}

export const SESSION_COOKIE_NAME =
  process.env.SESSION_COOKIE_NAME?.trim() || 'darkavianlabs.corpus.sid';
export const SHARED_THEME_COOKIE = 'dal.theme.mode';

export function ensureDataDirs(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(CENTRAL_DB_PATH), { recursive: true });
  fs.mkdirSync(path.dirname(PARAMETRIC_DB_PATH), { recursive: true });
}
