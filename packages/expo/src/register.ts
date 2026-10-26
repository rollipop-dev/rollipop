import { createRequire } from 'node:module';
import path from 'node:path';

/** Enable the adapter only after checking the project's required Rollipop peer. */
export default function register(projectRoot: string): void {
  const root = path.resolve(projectRoot);
  const projectRequire = createRequire(path.join(root, 'package.json'));
  try {
    projectRequire.resolve('rollipop/package.json');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'MODULE_NOT_FOUND') throw error;
    const { version }: typeof import('../package.json') = require('../package.json');
    throw new Error(
      `[@rollipop/expo] Missing peer dependency "rollipop" in ${root}.\nInstall it alongside @rollipop/expo, then restart Expo CLI:\n  yarn add -D rollipop@${version}\n  npm install --save-dev rollipop@${version}\n  pnpm add -D rollipop@${version}`,
    );
  }
  // Keep runtime imports behind the check so missing peers receive the installation guide.
  const registerAdapter: typeof import('./adapter').default =
    createRequire(__filename)('./adapter.cjs');
  registerAdapter(root);
}
