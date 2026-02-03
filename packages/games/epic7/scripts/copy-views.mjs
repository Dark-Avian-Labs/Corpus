import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  rmSync,
} from 'fs';
import { join } from 'path';

const src = 'src/views';
const dst = 'dist/views';

if (!existsSync(src)) {
  console.log('Epic7: no views dir, skipping copy');
  process.exit(0);
}

function copyRecursive(srcDir, dstDir) {
  if (!existsSync(dstDir)) mkdirSync(dstDir, { recursive: true });

  // Remove entries in dstDir that no longer exist in srcDir (stale files)
  for (const entry of readdirSync(dstDir)) {
    const srcPath = join(srcDir, entry);
    if (!existsSync(srcPath)) {
      rmSync(join(dstDir, entry), { recursive: true });
    }
  }

  for (const entry of readdirSync(srcDir)) {
    const srcPath = join(srcDir, entry);
    const dstPath = join(dstDir, entry);
    const stat = lstatSync(srcPath);
    // Skip symlinks to avoid infinite recursion
    if (stat.isSymbolicLink()) continue;
    if (stat.isDirectory()) copyRecursive(srcPath, dstPath);
    else copyFileSync(srcPath, dstPath);
  }
}

copyRecursive(src, dst);
console.log('Epic7: copied views to dist/views');
