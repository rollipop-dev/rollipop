import {
  REMOTE_CACHE_GLOBAL,
  SHARED_REGISTRY_GLOBAL,
  VIRTUAL_RUNTIME_ADAPTER_ID,
} from '../constants';
import type { NormalizedConfig } from '../types';
import { dedent } from './_dedent';

export function generateHostInitCode(config: NormalizedConfig) {
  const remotesArray = Object.values(config.remotes).map((remote) => ({
    name: remote.name,
    entry: remote.entry,
    type: remote.type,
    entryGlobalName: remote.entryGlobalName,
  }));

  const sharedEntries = Object.entries(config.shared);
  const sharedRegistryPropExprs = sharedEntries
    .map(([name]) => `  ${JSON.stringify(name)}: require(${JSON.stringify(name)}),`)
    .join('\n');

  const sharedRuntimeMap = sharedEntries.reduce(
    (acc, [name, info]) => ({
      ...acc,
      [name]: {
        version: info.version,
        shareConfig: {
          singleton: info.singleton,
          requiredVersion: info.requiredVersion ?? false,
          eager: info.eager,
        },
      },
    }),
    {} as Record<string, unknown>,
  );

  return dedent`
    import adapter from ${JSON.stringify(VIRTUAL_RUNTIME_ADAPTER_ID)};
    import { createInstance } from '@module-federation/runtime';

    globalThis.${SHARED_REGISTRY_GLOBAL} = globalThis.${SHARED_REGISTRY_GLOBAL} || {
    ${sharedRegistryPropExprs}
    };

    const sharedConfig = ${JSON.stringify(sharedRuntimeMap, null, 2)};
    for (const sharedName of Object.keys(sharedConfig)) {
      sharedConfig[sharedName].lib = () => globalThis.${SHARED_REGISTRY_GLOBAL}[sharedName];
    }

    const instance = createInstance({
      name: ${JSON.stringify(config.name)},
      remotes: ${JSON.stringify(remotesArray, null, 2)},
      shared: sharedConfig,
      plugins: [adapter],
      shareStrategy: ${JSON.stringify(config.shareStrategy)},
    });

    if (globalThis.${REMOTE_CACHE_GLOBAL} == null) {
      const cache = {
        modules: Object.create(null),
        pending: Object.create(null),
        load(id) {
          if (this.modules[id] !== undefined) {
            return Promise.resolve(this.modules[id]);
          }
          if (this.pending[id]) {
            return this.pending[id];
          }
          const fetcher = instance.loadRemote(id);
          this.pending[id] = fetcher.then((mod) => {
            this.modules[id] = mod;
            delete this.pending[id];
            return mod;
          });
          return this.pending[id];
        },
      };
      globalThis.${REMOTE_CACHE_GLOBAL} = cache;
    }
  `;
}
