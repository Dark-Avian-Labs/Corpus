import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

type ThemeMode = 'light' | 'dark';

const THEME_STORAGE_KEY = 'dal.theme.mode';
const SHARED_THEME_COOKIE = 'dal.theme.mode';
const SHARED_THEME_COOKIE_DOMAIN =
  (import.meta.env.VITE_SHARED_THEME_COOKIE_DOMAIN as string | undefined) ?? '';
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

interface ThemeContextValue {
  mode: ThemeMode;
  toggleMode: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function applyMode(mode: ThemeMode): void {
  const html = document.documentElement;
  html.classList.toggle('theme-light', mode === 'light');
  html.classList.toggle('theme-dark', mode === 'dark');
}

function writeThemeCookie(mode: ThemeMode): void {
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  const base = `${SHARED_THEME_COOKIE}=${mode}; Max-Age=${ONE_YEAR_SECONDS}; Path=/; SameSite=Lax${secure}`;
  const cookie = SHARED_THEME_COOKIE_DOMAIN
    ? `${base}; Domain=${SHARED_THEME_COOKIE_DOMAIN}`
    : base;
  document.cookie = cookie;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const hasMountedRef = useRef(false);
  const [mode, setMode] = useState<ThemeMode>(() => {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    const nextMode: ThemeMode = stored === 'light' ? 'light' : 'dark';
    applyMode(nextMode);
    return nextMode;
  });

  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }
    applyMode(mode);
    window.localStorage.setItem(THEME_STORAGE_KEY, mode);
    writeThemeCookie(mode);
  }, [mode]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      toggleMode: () => {
        setMode((prev) => (prev === 'dark' ? 'light' : 'dark'));
      },
    }),
    [mode],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return ctx;
}
