import { execSync } from 'node:child_process';
import path from 'node:path';

export function setup() {
  const monorepoRoot = path.resolve(import.meta.dirname, '..', '..', '..');

  console.log('Building workspace packages...');
  execSync('yarn build:all', {
    cwd: monorepoRoot,
    stdio: 'inherit',
    timeout: 300_000,
  });
  console.log('Build complete.');
}
