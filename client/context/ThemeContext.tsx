import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

type ThemeMode = 'light' | 'dark';

const THEME_STORAGE_KEY = 'dal.theme.mode';

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

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>('dark');

  useEffect(() => {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    const nextMode: ThemeMode = stored === 'light' ? 'light' : 'dark';
    setMode(nextMode);
    applyMode(nextMode);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      toggleMode: () => {
        const nextMode: ThemeMode = mode === 'dark' ? 'light' : 'dark';
        setMode(nextMode);
        applyMode(nextMode);
        window.localStorage.setItem(THEME_STORAGE_KEY, nextMode);
        document.cookie = `${THEME_STORAGE_KEY}=${nextMode}; path=/; samesite=lax`;
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
