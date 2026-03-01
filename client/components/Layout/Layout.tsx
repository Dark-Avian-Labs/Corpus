import {
  useEffect,
  useLayoutEffect,
  useMemo,
  type ReactNode,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';

import bgArt from '../../../packages/core/assets/background.txt?raw';
import feathers from '../../../packages/core/assets/feathers.png';
import epic7Favicon from '../../../packages/games/epic7/favicon.ico';
import warframeFavicon from '../../../packages/games/warframe/favicon.ico';
import {
  APP_DISPLAY_NAME,
  LEGAL_ENTITY_NAME,
  LEGAL_PAGE_URL,
} from '../../app/config';
import { APP_PATHS } from '../../app/paths';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../features/auth/AuthContext';
import { getProfileIconSrc } from '../../utils/profileIcons';
import { Menu } from '../ui/Menu';

export type LayoutOutletContext = {
  setHeaderCenter: (node: ReactNode | null) => void;
  setHeaderActions: (node: ReactNode | null) => void;
};

export function Layout() {
  const { mode, toggleMode } = useTheme();
  const location = useLocation();
  const { auth, logout } = useAuth();
  const isLoggedIn = auth.status === 'ok' && auth.user !== null;
  const isAdmin = auth.status === 'ok' && auth.user?.isAdmin === true;
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const firstMenuItemRef = useRef<HTMLElement | null>(null);
  const menuItemRefs = useRef<Array<HTMLElement | null>>([]);
  const menuItemNodeMap = useRef<Record<string, HTMLElement | null>>({});
  const prevMenuOpenRef = useRef(menuOpen);
  const currentYear = new Date().getFullYear();
  const avatarSrc = getProfileIconSrc(auth.user?.avatar ?? 1);
  const hasAvatar = avatarSrc.length > 0;
  const [headerCenter, setHeaderCenter] = useState<ReactNode | null>(null);
  const [headerActions, setHeaderActions] = useState<ReactNode | null>(null);
  const menuItemIds = useMemo(() => {
    if (!isLoggedIn) {
      return ['login'];
    }
    return isAdmin ? ['profile', 'admin', 'logout'] : ['profile', 'logout'];
  }, [isAdmin, isLoggedIn]);
  const menuItemIndexById = useMemo(() => {
    return new Map(menuItemIds.map((id, index) => [id, index]));
  }, [menuItemIds]);
  const isWarframeRoute = location.pathname.startsWith(APP_PATHS.warframe);
  const isEpic7Route = location.pathname.startsWith(APP_PATHS.epic7);
  const adminPath = isWarframeRoute
    ? APP_PATHS.warframeAdmin
    : isEpic7Route
      ? APP_PATHS.epic7Admin
      : APP_PATHS.admin;
  const brandTitle = isWarframeRoute
    ? 'Corpus - Warframe'
    : isEpic7Route
      ? 'Corpus - Epic7'
      : APP_DISPLAY_NAME;

  const setMenuItemRef = (id: string) => (node: HTMLElement | null) => {
    menuItemNodeMap.current[id] = node;
  };
  const nextMenuItemRef = (id: string) => setMenuItemRef(id);

  useLayoutEffect(() => {
    if (!menuOpen) {
      menuItemRefs.current = [];
      firstMenuItemRef.current = null;
      return;
    }

    const refsInOrder = menuItemIds.map(
      (id) => menuItemNodeMap.current[id] ?? null,
    );
    menuItemRefs.current = refsInOrder;
    firstMenuItemRef.current =
      refsInOrder.find((item): item is HTMLElement => item !== null) ?? null;

    for (const id of Object.keys(menuItemNodeMap.current)) {
      if (!menuItemIndexById.has(id)) {
        delete menuItemNodeMap.current[id];
      }
    }
  }, [menuItemIds, menuItemIndexById, menuOpen]);

  const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const { key } = event;
    if (
      key !== 'ArrowDown' &&
      key !== 'ArrowUp' &&
      key !== 'Home' &&
      key !== 'End' &&
      key !== 'Escape'
    ) {
      return;
    }

    if (key === 'Escape') {
      event.preventDefault();
      setMenuOpen(false);
      return;
    }

    const enabledItems = menuItemRefs.current.filter(
      (item): item is HTMLElement => {
        if (!item) {
          return false;
        }
        if (item.hasAttribute('disabled')) {
          return false;
        }
        return item.getAttribute('aria-disabled') !== 'true';
      },
    );

    if (enabledItems.length === 0) {
      return;
    }

    event.preventDefault();

    if (key === 'Home') {
      enabledItems[0]?.focus();
      return;
    }
    if (key === 'End') {
      enabledItems[enabledItems.length - 1]?.focus();
      return;
    }

    const activeElement =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const currentIndex = activeElement
      ? enabledItems.indexOf(activeElement)
      : -1;
    const direction = key === 'ArrowDown' ? 1 : -1;
    const nextIndex =
      currentIndex === -1
        ? key === 'ArrowDown'
          ? 0
          : enabledItems.length - 1
        : (currentIndex + direction + enabledItems.length) %
          enabledItems.length;

    enabledItems[nextIndex]?.focus();
  };

  useEffect(() => {
    const path = location.pathname;
    let faviconHref = '/favicon.ico';
    if (path.startsWith(APP_PATHS.warframe)) {
      document.title = 'Corpus - Warframe';
      faviconHref = warframeFavicon;
    } else if (path.startsWith(APP_PATHS.epic7)) {
      document.title = 'Corpus - Epic7';
      faviconHref = epic7Favicon;
    } else {
      document.title = 'Corpus';
    }
    let favicon = document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
    if (!favicon) {
      favicon = document.createElement('link');
      favicon.rel = 'icon';
      document.head.append(favicon);
    }
    favicon.href = faviconHref;
  }, [location.pathname]);

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

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-black focus:px-3 focus:py-2 focus:text-white"
      >
        Skip to main content
      </a>
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
              {brandTitle}
            </span>
          </Link>

          <div className="justify-self-center">{headerCenter}</div>

          <div className="flex flex-wrap items-center justify-end gap-3">
            {headerActions}
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
                className="icon-toggle-btn profile-avatar-btn"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label="Open user menu"
                onClick={() => setMenuOpen((prev) => !prev)}
              >
                {isLoggedIn ? (
                  hasAvatar ? (
                    <img
                      src={avatarSrc}
                      alt=""
                      className="profile-avatar-image"
                    />
                  ) : (
                    <span aria-hidden="true" className="text-xs font-semibold">
                      #{auth.user?.avatar ?? 1}
                    </span>
                  )
                ) : (
                  <span aria-hidden="true" className="text-xs font-semibold">
                    🔐
                  </span>
                )}
              </button>
              {menuOpen ? (
                <Menu baseClass="user-menu" className="focus:outline-none">
                  <div role="menu" onKeyDown={onMenuKeyDown}>
                    {!isLoggedIn ? (
                      <a
                        ref={nextMenuItemRef('login')}
                        href="/auth/login"
                        className="user-menu-item"
                        role="menuitem"
                        tabIndex={-1}
                        onClick={() => setMenuOpen(false)}
                      >
                        Login
                      </a>
                    ) : (
                      <>
                        <a
                          ref={nextMenuItemRef('profile')}
                          href="/auth/profile"
                          className="user-menu-item"
                          role="menuitem"
                          tabIndex={-1}
                          onClick={() => setMenuOpen(false)}
                        >
                          Profile
                        </a>
                        {isAdmin ? (
                          <NavLink
                            ref={nextMenuItemRef('admin')}
                            to={adminPath}
                            className="user-menu-item"
                            role="menuitem"
                            tabIndex={-1}
                            onClick={() => setMenuOpen(false)}
                          >
                            Admin
                          </NavLink>
                        ) : null}
                        <button
                          ref={nextMenuItemRef('logout')}
                          className="user-menu-item"
                          role="menuitem"
                          type="button"
                          tabIndex={-1}
                          onClick={() => {
                            setMenuOpen(false);
                            void logout('/login').catch(() => {
                              // AuthContext logout always redirects in a finally block.
                            });
                          }}
                        >
                          Logout
                        </button>
                      </>
                    )}
                  </div>
                </Menu>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      <main id="main-content" className="relative z-0 flex-1 px-6 pb-6">
        <div className="mx-auto w-full max-w-[1900px]">
          <Outlet context={{ setHeaderCenter, setHeaderActions }} />
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
