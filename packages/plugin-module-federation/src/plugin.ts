import path from 'node:path';

import { invariant } from 'es-toolkit';
import type { Plugin, ResolvedConfig } from 'rollipop';
import { id, include, prefixRegex } from 'rollipop/filter';

import {
  HMR_EVENT,
  PLUGIN_NAME,
  VIRTUAL_HOST_INIT_ID,
  VIRTUAL_PREFIX,
  VIRTUAL_REMOTE_PROXY_PREFIX,
  VIRTUAL_SHARED_SHIM_PREFIX,
} from './constants';
import { loadVirtualModule } from './host/load';
import { resolveVirtualId } from './host/resolve';
import { normalizeConfig } from './normalize';
import type { ModuleFederationConfig, NormalizedConfig } from './types';
import { generateRemoteEntryCode } from './virtual/remote-entry';
import { generateRemoteProxyCode } from './virtual/remote-proxy';
import { generateSharedShimCode } from './virtual/shared-shim';

export function moduleFederationPlugin(config: ModuleFederationConfig): Plugin {
  const federationConfig = config;
  const hasRemotes = Object.keys(federationConfig.remotes ?? {}).length > 0;
  const hasExposes = Object.keys(federationConfig.exposes ?? {}).length > 0;

  if (hasRemotes && hasExposes) {
    throw new Error(
      `[${PLUGIN_NAME}] A single config cannot define both 'remotes' and 'exposes'. Split into two configs (one host, one remote) and run them as separate Rollipop processes.`,
    );
  }

  let resolvedConfig: ResolvedConfig | null = null;
  let normalized: NormalizedConfig | null = null;
  let broadcast: (() => void) | null = null;
  const exposesAbsolute: Record<string, string> = {};
  const sharedRoots = new Set(collectSharedNames(federationConfig));

  // Debounce file-change broadcasts. Only used in the remote role.
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  return {
    name: PLUGIN_NAME,
    config(pluginConfig) {
      if (hasExposes) {
        // Federation remote runs inside a host that already initialized the React Native runtime.
        // So we don't need to run the prelude and polyfills again.
        pluginConfig.prelude = [];
        pluginConfig.polyfills = [];

        return {
          dangerously_overrideRolldownOptions: (opts) => ({
            input: opts.input,
            // Output as IIFE — the bundle is a script that dynamically runs on the runtime.
            output: { ...opts.output, format: 'iife' },
          }),
        };
      }

      if (hasRemotes && config.runtime?.implement != null) {
        const polyfills = (pluginConfig.polyfills ??= []);
        polyfills.push({ type: 'iife', code: config.runtime.implement });
      }
    },
    configResolved(config) {
      resolvedConfig = config;
      normalized = normalizeConfig(federationConfig, config.root);

      if (hasExposes) {
        for (const [key, filePath] of Object.entries(normalized.exposes)) {
          exposesAbsolute[key] = path.resolve(config.root, filePath);
        }
      }
    },
    resolveId: {
      handler(source) {
        if (hasExposes && sharedRoots.has(source)) {
          return { id: VIRTUAL_SHARED_SHIM_PREFIX + source };
        }

        if (hasRemotes && normalized != null) {
          const remoteNames = Object.keys(normalized.remotes);
          for (const name of remoteNames) {
            if (source === name || source.startsWith(`${name}/`)) {
              return { id: VIRTUAL_REMOTE_PROXY_PREFIX + source };
            }
          }
        }

        const resolved = resolveVirtualId(source);
        if (resolved != null) {
          return { id: resolved };
        }

        return null;
      },
    },
    load: {
      filter: [include(id(prefixRegex(VIRTUAL_PREFIX)))],
      handler(id) {
        if (id.startsWith(VIRTUAL_SHARED_SHIM_PREFIX)) {
          const sharedName = id.slice(VIRTUAL_SHARED_SHIM_PREFIX.length);
          return { code: generateSharedShimCode(sharedName), moduleType: 'js' };
        }

        if (id.startsWith(VIRTUAL_REMOTE_PROXY_PREFIX)) {
          const remoteId = id.slice(VIRTUAL_REMOTE_PROXY_PREFIX.length);
          const reactAware = resolvedConfig?.mode !== 'production';
          return { code: generateRemoteProxyCode({ remoteId, reactAware }), moduleType: 'js' };
        }

        if (normalized == null) {
          return null;
        }

        const code = loadVirtualModule(id, normalized);
        if (code != null) {
          return { code, moduleType: 'js' };
        }

        return null;
      },
    },
    transform: {
      handler(code, id, meta) {
        const { magicString } = meta;
        invariant(magicString, 'magicString not found');

        if (normalized == null || resolvedConfig == null) {
          return null;
        }

        if (id.startsWith(VIRTUAL_PREFIX)) {
          return null;
        }

        const isEntry = this.getModuleInfo(id)?.isEntry ?? false;

        if (hasExposes) {
          if (!isEntry) {
            return null;
          }

          const containerCode = generateRemoteEntryCode({
            name: normalized.name,
            exposes: exposesAbsolute,
          });

          magicString.append('\n' + containerCode);

          return { code: magicString };
        }

        if (hasRemotes && isEntry) {
          magicString.prepend(`import ${JSON.stringify(VIRTUAL_HOST_INIT_ID)};\n`);

          return { code: magicString };
        }

        return null;
      },
    },
    watchChange() {
      if (!hasExposes || broadcast == null) {
        return;
      }
      if (debounceTimer != null) {
        clearTimeout(debounceTimer);
      }
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        broadcast?.();
      }, 100);
    },
    configureServer(server) {
      if (!hasExposes) {
        return;
      }
      broadcast = () => {
        server.hot.sendAll(HMR_EVENT, { name: federationConfig.name });
      };
    },
  };
}

function collectSharedNames(config: ModuleFederationConfig) {
  const shared = config.shared;
  if (shared == null) {
    return [];
  }
  return Array.isArray(shared) ? shared : Object.keys(shared);
}
