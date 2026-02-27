import { Component, lazy, Suspense, type ComponentType, type ErrorInfo, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import { APP_PATHS } from './paths';
import { Layout } from '../components/Layout/Layout';
import { RequireAuth } from '../features/auth/RequireAuth';

const lazyNamed = <TModule extends Record<string, unknown>>(
  importer: () => Promise<TModule>,
  exportName: keyof TModule,
) =>
  lazy(() =>
    importer().then((mod) => ({
      default: mod[exportName] as ComponentType,
    })),
  );

const HomePage = lazyNamed(() => import('../features/selector/HomePage'), 'HomePage');
const WarframePage = lazyNamed(
  () => import('../features/warframe/WarframePage'),
  'WarframePage',
);
const Epic7Page = lazyNamed(() => import('../features/epic7/Epic7Page'), 'Epic7Page');
const LegalPage = lazyNamed(() => import('../features/legal/LegalPage'), 'LegalPage');
const AdminPage = lazyNamed(() => import('../features/admin/AdminPage'), 'AdminPage');

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

type ChunkErrorBoundaryState = {
  hasError: boolean;
};

function ChunkLoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center"
      role="alert"
      aria-live="assertive"
    >
      <p className="text-sm text-muted">
        Something went wrong while loading this page. Please try again.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-md border border-border px-3 py-1.5 text-sm text-foreground transition hover:bg-secondary"
      >
        Retry
      </button>
    </div>
  );
}

class ChunkErrorBoundary extends Component<{ children: ReactNode }, ChunkErrorBoundaryState> {
  public state: ChunkErrorBoundaryState = { hasError: false };

  public static getDerivedStateFromError(): ChunkErrorBoundaryState {
    return { hasError: true };
  }

  public componentDidCatch(error: Error, info: ErrorInfo): void {
    // Keep this visible in dev tools for failed lazy chunks and route imports.
    console.error('Chunk load failed in AppRoutes', error, info);
  }

  private handleRetry = () => {
    this.setState({ hasError: false });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return <ChunkLoadError onRetry={this.handleRetry} />;
    }

    return this.props.children;
  }
}

export function AppRoutes() {
  return (
    <ChunkErrorBoundary>
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
            <Route path="*" element={<Navigate to={APP_PATHS.legal} replace />} />
          </Route>
        </Routes>
      </Suspense>
    </ChunkErrorBoundary>
  );
}
