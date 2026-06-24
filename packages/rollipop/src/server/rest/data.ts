import type { DevServerContext } from '../types';
import { fetchDevToolsTargets, getDevToolsTargetId } from './devtools-targets';
import {
  serializeBuildSummary,
  serializeBundler,
  serializeConfigInfo,
  serializeDevice,
  serializeDevServerStatus,
  serializeFeatureFlags,
  serializeProjectInfo,
} from './serializers';

export interface Snapshot {
  project: ReturnType<typeof getProjectInfo>;
  bundlers: ReturnType<typeof getBundlers>;
  devices: Awaited<ReturnType<typeof getDevices>>;
  buildSummary: ReturnType<typeof getBuildSummary>;
}

export async function getSnapshot(context: DevServerContext): Promise<Snapshot> {
  return {
    project: getProjectInfo(context),
    bundlers: getBundlers(context),
    devices: await getDevices(context),
    buildSummary: getBuildSummary(context),
  };
}

export function getProjectInfo(context: DevServerContext) {
  return serializeProjectInfo(context.config, getDevServerStatus(context));
}

export function getConfigInfo(context: DevServerContext) {
  return serializeConfigInfo(context.config);
}

export function getFeatureFlags(context: DevServerContext) {
  return serializeFeatureFlags(context.config);
}

export function getDevServerStatus(context: DevServerContext) {
  return serializeDevServerStatus({
    serverBaseUrl: context.serverBaseUrl,
    startedAt: context.state.startedAt,
    uptimeMs: context.state.uptimeMs,
  });
}

export function getBuildSummary(context: DevServerContext) {
  return serializeBuildSummary(context.state.getBuilds());
}

export function getBundlers(context: DevServerContext) {
  return context.bundlerPool
    .getInstances()
    .map((bundler) => serializeBundler(context.serverBaseUrl, bundler));
}

export function getBundler(context: DevServerContext, bundlerId: string) {
  const bundler = context.bundlerPool.getInstanceById(bundlerId);

  return bundler == null ? undefined : serializeBundler(context.serverBaseUrl, bundler);
}

export async function getDevices(context: DevServerContext) {
  const targets = await fetchDevToolsTargets(context.serverBaseUrl);

  return targets.map((target, index) =>
    serializeDevice(context.serverBaseUrl, target, index, false),
  );
}

export async function getDevice(context: DevServerContext, deviceId: string) {
  const targets = await fetchDevToolsTargets(context.serverBaseUrl);
  const targetIndex = targets.findIndex(
    (target, index) => getDevToolsTargetId(target, index) === deviceId,
  );

  return targetIndex === -1
    ? undefined
    : serializeDevice(context.serverBaseUrl, targets[targetIndex]!, targetIndex, true);
}
