import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

function copyRecursive(srcDir, dstDir) {
  if (!existsSync(srcDir)) {
    throw new Error(`Source directory ${srcDir} does not exist`);
  }

  if (!existsSync(dstDir)) {
    mkdirSync(dstDir, { recursive: true });
  }

  const entries = readdirSync(srcDir);

  for (const entry of entries) {
    const srcPath = join(srcDir, entry);
    const dstPath = join(dstDir, entry);
    const stat = statSync(srcPath);

    if (stat.isDirectory()) {
      copyRecursive(srcPath, dstPath);
    } else {
      copyFileSync(srcPath, dstPath);
    }
  }
}

// Copy views
const viewsSrc = 'src/views';
const viewsDst = 'dist/views';
copyRecursive(viewsSrc, viewsDst);
console.log(`Copied views from ${viewsSrc} to ${viewsDst}`);

// Copy icons
const iconsSrc = 'icons';
const iconsDst = 'dist/icons';
if (existsSync(iconsSrc)) {
  copyRecursive(iconsSrc, iconsDst);
  console.log(`Copied icons from ${iconsSrc} to ${iconsDst}`);
}
