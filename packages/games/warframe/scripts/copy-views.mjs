import { cpSync, existsSync } from 'fs';

const src = 'src/views';
const dst = 'dist/views';

if (!existsSync(src)) {
  console.warn(`Warframe: source views ${src} not found, skipping copy`);
  process.exit(0);
}

cpSync(src, dst, { recursive: true, force: true, errorOnExist: false });
console.log('Warframe: copied views to dist/views');
