import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import { APP_PATHS } from './paths';
import { Layout } from '../components/Layout/Layout';
import { RequireAuth } from '../features/auth/RequireAuth';

const HomePage = lazy(() =>
  import('../features/selector/HomePage').then((mod) => ({
    default: mod.HomePage,
  })),
);
const WarframePage = lazy(() =>
  import('../features/warframe/WarframePage').then((mod) => ({
    default: mod.WarframePage,
  })),
);
const Epic7Page = lazy(() =>
  import('../features/epic7/Epic7Page').then((mod) => ({
    default: mod.Epic7Page,
  })),
);
const LegalPage = lazy(() =>
  import('../features/legal/LegalPage').then((mod) => ({
    default: mod.LegalPage,
  })),
);
const AdminPage = lazy(() =>
  import('../features/admin/AdminPage').then((mod) => ({
    default: mod.AdminPage,
  })),
);

function RouteFallback() {
  return (
    <div
      className="flex min-h-screen items-center justify-center"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <p className="text-sm text-muted">Loading...</p>
    </div>
  );
}

export function AppRoutes() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route element={<Layout />}>
          <Route path={APP_PATHS.legal} element={<LegalPage />} />
          <Route
            path={APP_PATHS.home}
            element={
              <RequireAuth>
                <HomePage />
              </RequireAuth>
            }
          />
          <Route
            path={APP_PATHS.warframe}
            element={
              <RequireAuth>
                <WarframePage />
              </RequireAuth>
            }
          />
          <Route
            path={APP_PATHS.epic7}
            element={
              <RequireAuth>
                <Epic7Page />
              </RequireAuth>
            }
          />
          <Route
            path={APP_PATHS.admin}
            element={
              <RequireAuth>
                <AdminPage />
              </RequireAuth>
            }
          />
          <Route path="*" element={<Navigate to={APP_PATHS.home} replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
