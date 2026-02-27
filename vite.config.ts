import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, loadEnv } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const resolvedAppName =
    env.VITE_APP_NAME?.trim() || env.APP_NAME?.trim() || 'Corpus';
  const base = env.VITE_BASE_PATH || '/';
  return {
    base,
    plugins: [react(), tailwindcss()],
    define: {
      'import.meta.env.VITE_APP_NAME': JSON.stringify(resolvedAppName),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'client'),
      },
    },
    build: {
      outDir: 'dist/client',
      emptyOutDir: true,
    },
  };
});
