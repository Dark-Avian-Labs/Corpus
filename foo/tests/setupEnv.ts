import path from 'path';

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
