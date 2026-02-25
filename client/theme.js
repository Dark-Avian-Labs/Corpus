const THEME_KEY = 'dal.theme.mode';
const LEGACY_PARAMETRIC_KEY = 'parametric.theme.mode';
const THEME_COOKIE = 'dal.theme.mode';
const THEME_COOKIE_DOMAIN = '.shark5060.net';
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

function readCookie(name) {
  const encoded = `${name}=`;
  const parts = document.cookie.split(';');
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.startsWith(encoded)) {
      return decodeURIComponent(trimmed.slice(encoded.length));
    }
  }
  return '';
}

function normalizeTheme(value) {
  return value === 'light' ? 'light' : 'dark';
}

function readStoredTheme() {
  const stored = window.localStorage.getItem(THEME_KEY);
  if (stored === 'light' || stored === 'dark') return stored;

  const legacy = window.localStorage.getItem(LEGACY_PARAMETRIC_KEY);
  if (legacy === 'light' || legacy === 'dark') return legacy;

  const cookieTheme = readCookie(THEME_COOKIE);
  if (cookieTheme === 'light' || cookieTheme === 'dark') return cookieTheme;

  return 'dark';
}

function writeThemeCookie(mode) {
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  const base = `${THEME_COOKIE}=${encodeURIComponent(mode)}; Max-Age=${ONE_YEAR_SECONDS}; Path=/; SameSite=Lax${secure}`;
  document.cookie = base;
  document.cookie = `${base}; Domain=${THEME_COOKIE_DOMAIN}`;
}

function syncThemeButtons(mode) {
  document.querySelectorAll('[data-theme-toggle]').forEach((el) => {
    if (!(el instanceof HTMLButtonElement)) return;
    const next = mode === 'dark' ? 'light' : 'dark';
    el.setAttribute('aria-label', `Switch to ${next} mode`);
    el.setAttribute('title', `Switch to ${next} mode`);
    const icon = el.querySelector('[data-theme-icon]');
    if (icon) icon.textContent = mode === 'dark' ? '☀' : '☾';
  });
}

function applyTheme(mode) {
  const normalized = normalizeTheme(mode);
  const root = document.documentElement;
  root.classList.remove('theme-light', 'theme-dark');
  root.classList.add(`theme-${normalized}`);
  window.localStorage.setItem(THEME_KEY, normalized);
  writeThemeCookie(normalized);
  syncThemeButtons(normalized);
}

const initialTheme = readStoredTheme();
applyTheme(initialTheme);

document.querySelectorAll('[data-theme-toggle]').forEach((el) => {
  el.addEventListener('click', () => {
    const current = document.documentElement.classList.contains('theme-light')
      ? 'light'
      : 'dark';
    applyTheme(current === 'dark' ? 'light' : 'dark');
  });
});
