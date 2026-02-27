import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';

import bgArt from '../../../packages/core/assets/background.txt?raw';
import feathers from '../../../packages/core/assets/feathers.png';
import {
  APP_DISPLAY_NAME,
  LEGAL_ENTITY_NAME,
  LEGAL_PAGE_URL,
} from '../../app/config';
import { APP_PATHS } from '../../app/paths';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../features/auth/AuthContext';

export function Layout() {
  const { mode, toggleMode } = useTheme();
  const { auth } = useAuth();
  const isLoggedIn = auth.status === 'ok' && auth.user !== null;
  const isAdmin = auth.status === 'ok' && auth.user.is_admin;
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const firstMenuItemRef = useRef<HTMLElement | null>(null);
  const prevMenuOpenRef = useRef(menuOpen);
  const currentYear = new Date().getFullYear();

  useEffect(() => {
    if (!menuOpen) {
      return undefined;
    }
    const onMouseDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (menuOpen) {
      firstMenuItemRef.current?.focus();
    } else if (prevMenuOpenRef.current) {
      triggerRef.current?.focus();
    }
    prevMenuOpenRef.current = menuOpen;
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) {
      return undefined;
    }
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
      }
    };
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('keydown', onEscape);
    };
  }, [menuOpen]);

  return (
    <div className="flex min-h-screen flex-col">
      <div className="bg-art" aria-hidden="true">
        {bgArt}
      </div>
      <header className="relative z-30 h-[100px] px-6">
        <div className="mx-auto grid h-full w-full max-w-[1900px] grid-cols-[1fr_auto_1fr] items-center gap-4">
          <Link to={APP_PATHS.home} className="brand-lockup w-fit">
            <img
              src={feathers}
              alt="Dark Avian Labs feather mark"
              className="brand-lockup__icon"
            />
            <span className="brand-lockup__title brand-lockup--fx">
              {APP_DISPLAY_NAME}
            </span>
          </Link>

          <nav
            className="justify-self-center flex items-center gap-2"
            aria-label="Main"
          >
            <NavLink to={APP_PATHS.home} className="header-link">
              Home
            </NavLink>
            <NavLink to={APP_PATHS.warframe} className="header-link">
              Warframe
            </NavLink>
            <NavLink to={APP_PATHS.epic7} className="header-link">
              Epic Seven
            </NavLink>
            {isAdmin ? (
              <NavLink to={APP_PATHS.admin} className="header-link">
                Admin
              </NavLink>
            ) : null}
          </nav>

          <div className="flex flex-wrap items-center justify-end gap-3">
            <button
              type="button"
              className="icon-toggle-btn"
              onClick={toggleMode}
              aria-label={`Switch to ${mode === 'dark' ? 'light' : 'dark'} mode`}
              title={`Switch to ${mode === 'dark' ? 'light' : 'dark'} mode`}
            >
              <span aria-hidden="true">{mode === 'dark' ? '☀' : '☾'}</span>
            </button>

            <div ref={menuRef} className="relative">
              <button
                ref={triggerRef}
                type="button"
                className="icon-toggle-btn"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label="Open user menu"
                onClick={() => setMenuOpen((prev) => !prev)}
              >
                <span aria-hidden="true" className="text-xs font-semibold">
                  {isLoggedIn ? `#${auth.user.avatar || 1}` : '🔐'}
                </span>
              </button>
              {menuOpen ? (
                <div className="absolute right-0 top-[calc(100%+8px)] z-50 min-w-[170px] rounded-xl border border-[var(--color-glass-border)] bg-[var(--color-surface-modal)] p-1.5 backdrop-blur">
                  {!isLoggedIn ? (
                    <a
                      ref={(node) => {
                        firstMenuItemRef.current = node;
                      }}
                      href="/auth/login"
                      className="user-menu-item block"
                      role="menuitem"
                      onClick={() => setMenuOpen(false)}
                    >
                      Login
                    </a>
                  ) : (
                    <>
                      <a
                        ref={(node) => {
                          firstMenuItemRef.current = node;
                        }}
                        href="/auth/profile"
                        className="user-menu-item block"
                        role="menuitem"
                        onClick={() => setMenuOpen(false)}
                      >
                        Profile
                      </a>
                      {isAdmin ? (
                        <NavLink
                          to={APP_PATHS.admin}
                          className="user-menu-item block"
                          role="menuitem"
                          onClick={() => setMenuOpen(false)}
                        >
                          Admin
                        </NavLink>
                      ) : null}
                      <a
                        href="/logout"
                        className="user-menu-item block"
                        role="menuitem"
                        onClick={() => setMenuOpen(false)}
                      >
                        Logout
                      </a>
                    </>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      <main className="relative z-0 flex-1 px-6 pb-6">
        <div className="mx-auto w-full max-w-[1900px]">
          <Outlet />
        </div>
      </main>

      <footer className="relative z-10 flex h-[50px] items-center justify-center px-6">
        <div className="mx-auto w-full max-w-[1900px] text-center">
          <a
            href={LEGAL_PAGE_URL}
            className="text-sm text-muted hover:text-foreground"
            target={LEGAL_PAGE_URL.startsWith('http') ? '_blank' : undefined}
            rel={LEGAL_PAGE_URL.startsWith('http') ? 'noreferrer' : undefined}
          >
            ©{currentYear} {LEGAL_ENTITY_NAME}
          </a>
        </div>
      </footer>
    </div>
  );
}
