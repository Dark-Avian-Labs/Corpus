import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  lstatSync,
} from 'fs';
import { join } from 'path';

const rootViews = 'src/views';
const distViews = 'dist/views';
const warframeViews = 'packages/games/warframe/src/views';
const epic7Views = 'packages/games/epic7/src/views';

function copyRecursive(srcDir, dstDir) {
  if (!existsSync(srcDir)) return;
  if (!existsSync(dstDir)) mkdirSync(dstDir, { recursive: true });
  for (const entry of readdirSync(srcDir)) {
    const srcPath = join(srcDir, entry);
    const dstPath = join(dstDir, entry);
    const stat = lstatSync(srcPath);
    if (stat.isSymbolicLink()) {
      // Skip symlinks to avoid following circular or external links
      continue;
    }
    if (stat.isDirectory()) {
      copyRecursive(srcPath, dstPath);
    } else {
      copyFileSync(srcPath, dstPath);
    }
  }
}

if (existsSync(rootViews)) {
  copyRecursive(rootViews, distViews);
  console.log('Copied root views to dist/views');
}

if (existsSync(warframeViews)) {
  const dst = join(distViews, 'warframe');
  copyRecursive(warframeViews, dst);
  console.log('Copied Warframe views to dist/views/warframe');
}

if (existsSync(epic7Views)) {
  const dst = join(distViews, 'epic7');
  copyRecursive(epic7Views, dst);
  console.log('Copied Epic7 views to dist/views/epic7');
}

const coreAssets = 'packages/core/assets';
const distShared = 'dist/shared';
if (existsSync(coreAssets)) {
  copyRecursive(coreAssets, distShared);
  console.log('Copied core assets to dist/shared');
}

const coreViews = 'packages/core/views';
if (existsSync(coreViews)) {
  copyRecursive(coreViews, distViews);
  console.log('Copied core views to dist/views');
}
