import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [tailwindcss()],

  build: {
    outDir: 'dist/static',
    emptyOutDir: true,
    // Merge all CSS into a single file
    cssCodeSplit: false,

    rollupOptions: {
      input: {
        // CSS entry — Tailwind processes the input.css via the Vite plugin
        styles: 'client/styles.js',
        // Game-specific client JS
        'warframe-index': 'packages/games/warframe/assets/js/warframe-index.js',
        'warframe-admin': 'packages/games/warframe/assets/js/warframe-admin.js',
        'epic7-index': 'packages/games/epic7/assets/js/epic7-index.js',
        'epic7-admin': 'packages/games/epic7/assets/js/epic7-admin.js',
        // Root admin JS
        admin: 'client/admin.js',
      },
      output: {
        // JS entries → dist/static/js/<name>.js
        entryFileNames: 'js/[name].js',
        chunkFileNames: 'js/[name].js',
        assetFileNames: (assetInfo) => {
          // Route CSS output to output.css for backwards-compatible path
          if (assetInfo.name?.endsWith('.css')) return 'output.css';
          return 'assets/[name][extname]';
        },
      },
    },
  },
});
