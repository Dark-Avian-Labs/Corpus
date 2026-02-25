import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [tailwindcss()],

  resolve: {
    alias: {
      '@lib': path.resolve(__dirname, 'client/lib'),
    },
  },

  build: {
    outDir: 'dist/static',
    emptyOutDir: true,
    cssCodeSplit: false,

    rollupOptions: {
      input: {
        styles: 'client/styles.js',
        theme: 'client/theme.js',
        'warframe-index': 'packages/games/warframe/assets/js/warframe-index.js',
        'warframe-admin': 'packages/games/warframe/assets/js/warframe-admin.js',
        'epic7-index': 'packages/games/epic7/assets/js/epic7-index.js',
        'epic7-admin': 'packages/games/epic7/assets/js/epic7-admin.js',
        admin: 'client/admin.js',
      },
      output: {
        entryFileNames: 'js/[name].js',
        chunkFileNames: 'js/[name].js',
        assetFileNames: (assetInfo) => {
          if (assetInfo.name?.endsWith('.css')) return 'output.css';
          return 'assets/[name][extname]';
        },
      },
    },
  },
});
