import { PLUGIN_NAME } from './constants';
import { resolveSharedVersion } from './shared/resolve-version';
import type {
  ModuleFederationConfig,
  ModuleFederationRemoteConfig,
  ModuleFederationSharedDependencyConfig,
  NormalizedConfig,
  NormalizedRemote,
  NormalizedShared,
} from './types';

const DEFAULT_SHARE_STRATEGY = 'version-first';

export function normalizeConfig(config: ModuleFederationConfig, projectRoot: string) {
  validateConfig(config);

  const remotes = normalizeRemotes(config.remotes ?? {});
  const exposes = config.exposes ?? {};
  const shared = normalizeShared(config.shared ?? [], projectRoot);

  const normalizedConfig: NormalizedConfig = {
    name: config.name,
    remotes,
    exposes,
    shared,
    shareStrategy: config.shareStrategy ?? DEFAULT_SHARE_STRATEGY,
    runtime: config.runtime,
    hasRemotes: Object.keys(remotes).length > 0,
    hasExposes: Object.keys(exposes).length > 0,
  };

  return normalizedConfig;
}

export function normalizeRemotes(remotes: Record<string, string | ModuleFederationRemoteConfig>) {
  const normalized = Object.entries(remotes).reduce(
    (acc, [key, value]) => {
      const remote: ModuleFederationRemoteConfig =
        typeof value === 'string' ? parseRemoteString(key, value) : value;
      return {
        ...acc,
        [key]: {
          name: remote.name,
          entry: remote.entry,
          type: remote.type ?? 'var',
          entryGlobalName: remote.name,
        },
      };
    },
    {} as Record<string, NormalizedRemote>,
  );

  return normalized;
}

function parseRemoteString(key: string, value: string) {
  const at = value.indexOf('@');
  if (at <= 0) {
    // Falls back to using the object key as the global name when the value is a plain URL
    return { name: key, entry: value };
  }
  return { name: value.slice(0, at), entry: value.slice(at + 1) };
}

export function normalizeShared(
  shared: string[] | Record<string, string | ModuleFederationSharedDependencyConfig>,
  projectRoot: string,
) {
  const entries: [string, ModuleFederationSharedDependencyConfig][] = Array.isArray(shared)
    ? shared.map((name) => [name, {}])
    : Object.entries(shared).map(([name, value]) =>
        typeof value === 'string' ? [name, { requiredVersion: value }] : [name, value],
      );

  const normalized = entries.reduce(
    (acc, [name, opts]) => ({
      ...acc,
      [name]: {
        version: resolveSharedVersion(name, projectRoot),
        requiredVersion: opts.requiredVersion,
        singleton: opts.singleton ?? false,
        eager: opts.eager ?? false,
      },
    }),
    {} as Record<string, NormalizedShared>,
  );

  return normalized;
}

function validateConfig(config: ModuleFederationConfig) {
  if (!config.name || typeof config.name !== 'string') {
    throw new Error(`[${PLUGIN_NAME}] 'name' is required and must be a non-empty string`);
  }

  if (config.remotes != null) {
    for (const [key, value] of Object.entries(config.remotes)) {
      if (typeof value === 'string') {
        continue;
      }
      if (!value.name || !value.entry) {
        throw new Error(`[${PLUGIN_NAME}] Remote '${key}' must have both 'name' and 'entry'`);
      }
    }
  }

  if (config.exposes != null) {
    for (const [key, value] of Object.entries(config.exposes)) {
      if (!key.startsWith('./')) {
        throw new Error(`[${PLUGIN_NAME}] Expose key '${key}' must start with './'`);
      }
      if (typeof value !== 'string') {
        throw new Error(`[${PLUGIN_NAME}] Expose value for '${key}' must be a string file path`);
      }
    }
  }
}
