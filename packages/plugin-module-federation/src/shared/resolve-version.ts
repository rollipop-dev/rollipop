import fs from 'node:fs';
import { createRequire } from 'node:module';

export function resolveSharedVersion(packageName: string, projectRoot: string) {
  try {
    const require = createRequire(`${projectRoot}/__placeholder__.js`);
    const packageJsonPath = require.resolve(`${packageName}/package.json`);
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    return typeof packageJson.version === 'string' ? packageJson.version : undefined;
  } catch {
    return undefined;
  }
}
