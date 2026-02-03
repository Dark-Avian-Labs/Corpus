import { copyFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const src = path.join(root, 'packages', 'core', 'dist', 'output.css');
const destDir = path.join(root, 'dist', 'static');
const dest = path.join(destDir, 'output.css');

if (!existsSync(src)) {
  console.log('copy-tailwind-static: no output.css, skip');
  process.exit(0);
}
if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });
copyFileSync(src, dest);
console.log('Copied Tailwind output to dist/static/output.css');
