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

const viewsSrc = 'src/views';
const viewsDst = 'dist/views';
copyRecursive(viewsSrc, viewsDst);
console.log(`Copied views from ${viewsSrc} to ${viewsDst}`);

const iconsSrc = 'icons';
const iconsDst = 'dist/icons';
if (existsSync(iconsSrc)) {
  copyRecursive(iconsSrc, iconsDst);
  console.log(`Copied icons from ${iconsSrc} to ${iconsDst}`);
}

const backgroundSrc = 'background.txt';
const backgroundDst = 'dist/background.txt';
if (existsSync(backgroundSrc)) {
  copyFileSync(backgroundSrc, backgroundDst);
  console.log(`Copied ${backgroundSrc} to ${backgroundDst}`);
}
