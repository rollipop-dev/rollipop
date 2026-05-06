import {
  HMR_EVENT,
  HMR_HOT_PATH,
  REMOTE_CACHE_GLOBAL,
  SCRIPT_LOADER_GLOBAL,
  SHARED_REGISTRY_GLOBAL,
  VIRTUAL_RUNTIME_ADAPTER_ID,
} from '../constants';
import type { NormalizedConfig } from '../types';
import { dedent, Q } from './_dedent';

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

    const remoteList = ${JSON.stringify(remotesArray)};

    if (globalThis.${REMOTE_CACHE_GLOBAL} == null) {
      const cache = {
        modules: Object.create(null),
        pending: Object.create(null),
        // Per-id invalidation: only ids actually present in the cache when
        // HMR fired need to bypass the federation runtime. Cleared after
        // each successful bypass load — new ids fall back to the normal
        // loadRemote flow with full shared-module negotiation.
        invalidatedIds: new Set(),
        subscribers: new Set(),
        load(id) {
          if (this.modules[id] !== undefined) {
            return Promise.resolve(this.modules[id]);
          }
          if (this.pending[id]) {
            return this.pending[id];
          }
          const isInvalidated = this.invalidatedIds.has(id);
          let fetcher;
          if (isInvalidated) {
            const slash = id.indexOf('/');
            const remoteName = slash === -1 ? id : id.slice(0, slash);
            const exposePath = slash === -1 ? '.' : './' + id.slice(slash + 1);
            fetcher = Promise.resolve().then(() => {
              const container = globalThis[remoteName];
              if (container == null) {
                throw new Error('[rollipop:module-federation] container ${Q}' + remoteName + '${Q} not registered');
              }
              return container.get(exposePath).then((factory) => {
                return typeof factory === 'function' ? factory() : factory;
              });
            });
          } else {
            fetcher = instance.loadRemote(id);
          }
          this.pending[id] = fetcher.then((mod) => {
            this.modules[id] = mod;
            delete this.pending[id];
            if (isInvalidated) {
              this.invalidatedIds.delete(id);
            }
            return mod;
          });
          return this.pending[id];
        },
        invalidate(remoteName) {
          for (const key of Object.keys(this.modules)) {
            if (key === remoteName || key.startsWith(remoteName + '/')) {
              this.invalidatedIds.add(key);
              delete this.modules[key];
            }
          }
          for (const cb of this.subscribers) {
            try {
              cb(remoteName);
            } catch (_e) {}
          }
        },
      };
      globalThis.${REMOTE_CACHE_GLOBAL} = cache;
    }

    const __cache = globalThis.${REMOTE_CACHE_GLOBAL};

    async function applyRemoteUpdate(remote) {
      const generation = (remote.__mfHmrGen = (remote.__mfHmrGen || 0) + 1);
      const cacheBust = (remote.entry.indexOf('?') === -1 ? '?' : '&') + '_mf_hmr=' + generation;
      try {
        await globalThis.${SCRIPT_LOADER_GLOBAL}.loadScript({
          scriptId: remote.name + '@' + generation,
          url: remote.entry + cacheBust,
        });
      } catch (error) {
        console.error(
          '[rollipop:module-federation] failed to reload remote ${Q}' + remote.name + '${Q} during HMR. App is running stale code until next successful update.',
          error,
        );
        return;
      }
      __cache.invalidate(remote.name);
    }

    function subscribeRemoteHmr(remote) {
      let wsUrl;
      try {
        const url = new URL(remote.entry);
        const wsProtocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
        wsUrl = wsProtocol + '//' + url.host + ${JSON.stringify(HMR_HOT_PATH)};
      } catch (_e) {
        return;
      }

      const connect = () => {
        let socket;
        try {
          socket = new WebSocket(wsUrl);
        } catch (_e) {
          setTimeout(connect, 1000);
          return;
        }
        socket.onmessage = (event) => {
          let parsed;
          try {
            parsed = JSON.parse(typeof event.data === 'string' ? event.data : '');
          } catch (_e) {
            return;
          }
          if (parsed == null || parsed.type !== ${JSON.stringify(HMR_EVENT)}) {
            return;
          }
          if (parsed.payload != null && parsed.payload.name !== remote.name) {
            return;
          }
          applyRemoteUpdate(remote);
        };
        socket.onclose = () => setTimeout(connect, 1000);
        socket.onerror = () => {
          try {
            socket.close();
          } catch (_e) {}
        };
      };
      connect();
    }

    // Defer to the next tick so React Native's InitializeCore has set up
    // WebSocket / setTimeout before the subscription starts.
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      Promise.resolve().then(() => {
        if (typeof WebSocket === 'undefined') {
          return;
        }
        for (const r of remoteList) {
          subscribeRemoteHmr(r);
        }
      });
    }
  `;
}
