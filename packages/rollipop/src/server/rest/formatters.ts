import type { ResolvedConfig } from '../../config';
import { ROLLIPOP_VERSION } from '../../constants';
import { toJsonSafe } from '../../utils/serialize';
import { getBundleSourceMapUrl, getBundleUrl } from '../bundle-url';
import type { BundlerDevEngine } from '../bundler-pool';
import type { BuildState } from '../state/store';
import type { DevToolsTarget } from './devtools-targets';
import { getDevToolsTargetId } from './devtools-targets';

export function serializeProjectInfo(
  config: ResolvedConfig,
  server: ReturnType<typeof serializeDevServerStatus>,
) {
  return {
    bundlerVersion: ROLLIPOP_VERSION,
    rootPath: config.root,
    configPath: config.configFile,
    server,
  };
}

export function serializeConfigInfo(config: ResolvedConfig) {
  const resolved = toJsonSafe(config);

  return {
    path: config.configFile,
    resolved,
    serialized: JSON.stringify(resolved, null, 2),
  };
}

export function serializeFeatureFlags(config: ResolvedConfig) {
  return {
    analyze: config.analyzer.enabled,
  };
}

export function serializeDevServerStatus({
  serverBaseUrl,
  startedAt,
  uptimeMs,
}: {
  serverBaseUrl: string;
  startedAt: Date;
  uptimeMs: number;
}) {
  const serverUrl = new URL(serverBaseUrl);

  return {
    host: serverUrl.hostname,
    port: Number(serverUrl.port),
    status: 'listening' as const,
    startedAt: startedAt.toISOString(),
    uptimeMs,
    serverBaseUrl,
  };
}

export function serializeBuildSummary(builds: BuildState[]) {
  return {
    count: builds.length,
    latest: builds[0] ?? null,
  };
}

export function serializeBundler(serverBaseUrl: string, bundler: BundlerDevEngine) {
  const options = bundler.buildOptions;

  return {
    id: bundler.id,
    platform: options.platform,
    dev: options.dev,
    entry: bundler.entry,
    status: bundler.status,
    bundleUrl: getBundleUrl(serverBaseUrl, bundler.entry, options).toString(),
    sourceMapUrl: getBundleSourceMapUrl(serverBaseUrl, bundler.entry, options).toString(),
    buildOptions: options,
  };
}

export function serializeDevice(
  serverBaseUrl: string,
  target: DevToolsTarget,
  index: number,
  includeTarget: boolean,
) {
  const id = getDevToolsTargetId(target, index);
  const devtoolsFrontendUrl = getString(target.devtoolsFrontendUrl);
  const debuggerUrl =
    devtoolsFrontendUrl == null
      ? undefined
      : new URL(devtoolsFrontendUrl, serverBaseUrl).toString();

  return {
    id,
    name: getString(target.title) ?? getString(target.description) ?? `Device ${index + 1}`,
    debuggerUrl,
    ...(includeTarget ? { debugTarget: target } : {}),
  };
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
