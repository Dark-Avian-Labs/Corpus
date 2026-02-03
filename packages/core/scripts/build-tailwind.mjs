import { spawnSync } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.join(__dirname, '..');
const input = path.join(pkgRoot, 'src', 'input.css');
const output = path.join(pkgRoot, 'dist', 'output.css');

if (!existsSync(input)) {
  console.log('Tailwind: no input.css, skip');
  process.exit(0);
}

const isWin = process.platform === 'win32';
const result = isWin
  ? spawnSync(`npx @tailwindcss/cli -i "${input}" -o "${output}" --minify`, {
      cwd: pkgRoot,
      stdio: 'inherit',
      shell: true,
    })
  : spawnSync(
      'npx',
      ['@tailwindcss/cli', '-i', input, '-o', output, '--minify'],
      { cwd: pkgRoot, stdio: 'inherit' },
    );
if (result.error) {
  const cmd = isWin
    ? `npx @tailwindcss/cli -i "${input}" -o "${output}" --minify`
    : `npx @tailwindcss/cli -i ${input} -o ${output} --minify`;
  console.error(
    'Tailwind: spawn failed for command:',
    cmd,
    '\ninput:',
    input,
    '\noutput:',
    output,
  );
  const err = result.error;
  if (err.code) console.error('error.code:', err.code);
  if (err.message) console.error('error.message:', err.message);
  if (err.stack) console.error('error.stack:', err.stack);
  process.exit(1);
}
if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
console.log('Tailwind: built', output);
