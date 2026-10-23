import path from 'node:path';

import register from './register';

// Resource-script imports precede app config evaluation, so native config mods load the adapter first. Limit the preload to this one Expo Updates entry point.
if (path.basename(process.argv[1] ?? '') === 'createUpdatesResources.js') {
  const projectRoot = process.argv[3];
  if (projectRoot) register(projectRoot);
}
