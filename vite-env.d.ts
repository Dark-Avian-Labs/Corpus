/// <reference types="vite/client" />

declare module '@fontsource-variable/inter';
declare module '@fontsource-variable/geist';
declare module '@fontsource-variable/geist-mono';

interface ImportMetaEnv {
  readonly VITE_APP_VERSION?: string;
  readonly VITE_APP_NAME?: string;
  readonly VITE_LEGAL_ENTITY_NAME?: string;
  readonly VITE_LEGAL_PAGE_URL?: string;
  readonly VITE_SEARCH_PLACEHOLDER?: string;
  readonly VITE_SHARED_THEME_COOKIE_DOMAIN?: string;
  readonly VITE_BASE_PATH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
