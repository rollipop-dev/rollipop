import fs from 'node:fs';

// Expo Go must reload through its host to recreate the scoped native context. Rollipop exposes runtimeImplement so the adapter can specialize that operation.
export default fs.readFileSync(require.resolve('rollipop/hmr-runtime'), 'utf8') +
  `
globalThis.__rollipop_runtime__.subscribeGraph(({ runtime }) => {
  const reload = runtime.reload.bind(runtime);
  runtime.reload = (reason) => {
    if (typeof globalThis.expo?.reloadAppAsync === 'function') {
      if (runtime.reloadRequested) return;
      runtime.reloadRequested = true;
      return globalThis.expo.reloadAppAsync(reason || 'Rollipop HMR');
    }
    return reload(reason);
  };
});
`;
