import { AppRoutes } from './app/routes';
import { AuthProvider } from './features/auth/AuthContext';

export function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
