import { defineDevframe, defineRpcFunction, type DevframeScopedNodeRpc } from 'devframe';

import { getBaseBundleName } from '../../utils/bundle';
import { resetCache } from '../../utils/reset-cache';
import { parseUrl } from '../../utils/url';
import { symbolicate } from '../symbolicate';
import type { DevServerContext } from '../types';
import { registerAgentTools, type AgentToolContext } from './agent/tools';
import { getConfigInfo, getDevice, getFeatureFlags, getSnapshot, type Snapshot } from './data';
import { toDevframeEvent, type DevframeEvent } from './events';

export const ROLLIPOP_DEVFRAME_SCOPE = 'rollipop';
export const DASHBOARD_EVENTS_STATE_KEY = 'events';

export interface DashboardEventsState {
  lastEvent: {
    sequence: number;
    data: DevframeEvent;
  } | null;
}

export class RollipopDevframeController {
  private sequence = 0;
  private updateEventState?: (event: NonNullable<DashboardEventsState['lastEvent']>) => void;
  private unsubscribeEventBus?: () => void;

  readonly definition;

  constructor(
    private readonly context: DevServerContext,
    agentToolContext: AgentToolContext,
  ) {
    this.definition = defineDevframe({
      id: 'rollipop',
      name: 'Rollipop',
      version: globalThis.__ROLLIPOP_VERSION__,
      packageName: 'rollipop',
      homepage: 'https://github.com/rollipop-dev/rollipop',
      description: 'React Native development dashboard powered by Rollipop.',
      capabilities: {
        dev: true,
        build: false,
      },
      setup: async (devframeContext) => {
        const scope = devframeContext.scope(ROLLIPOP_DEVFRAME_SCOPE);
        const sharedState = await scope.rpc.sharedState<DashboardEventsState>(
          DASHBOARD_EVENTS_STATE_KEY,
          { initialValue: { lastEvent: null } },
        );

        this.updateEventState = (event) => {
          // Publish notifications only; dashboard data is read by explicit RPC queries.
          sharedState.mutate((current) => {
            current.lastEvent = event;
          });
        };

        registerDashboardRpcFunctions(scope.rpc, this);
        registerAgentTools(devframeContext.agent, agentToolContext);

        this.unsubscribeEventBus = context.eventBus.subscribe((event) => {
          const data = toDevframeEvent(event);
          if (data == null) return;

          this.notify(data);
        });
      },
    });
  }

  notify(data: DevframeEvent): void {
    this.updateEventState?.({ sequence: ++this.sequence, data });
  }

  getSnapshot(): Promise<Snapshot> {
    return getSnapshot(this.context);
  }

  getBuilds() {
    return this.context.state.getBuilds();
  }

  getBuildLogs(bundlerId: string) {
    const logs = this.context.state.getBuildLogs(bundlerId);
    if (logs != null) return logs;

    if (this.context.bundlerPool.getInstanceById(bundlerId) == null) {
      throw new Error(`Build logs not found: ${bundlerId}`);
    }

    return [];
  }

  deleteBuildLogs(bundlerId: string): void {
    const deleted = this.context.state.clearBuildLogs(bundlerId);
    if (!deleted && this.context.bundlerPool.getInstanceById(bundlerId) == null) {
      throw new Error(`Build logs not found: ${bundlerId}`);
    }
  }

  getConfig() {
    return getConfigInfo(this.context);
  }

  getFeatureFlags() {
    return getFeatureFlags(this.context);
  }

  async getDevice(deviceId: string) {
    const device = await getDevice(this.context, deviceId);
    if (device == null) {
      throw new Error(`Device not found: ${deviceId}`);
    }

    return device;
  }

  async symbolicateBundlePosition(bundleUrl: string, line: number, column: number) {
    const { pathname, query } = parseUrl(bundleUrl);
    if (pathname == null || query.platform == null || query.dev == null) {
      throw new Error('Bundle URL must include pathname, platform, and dev query parameters');
    }

    const bundler = this.context.bundlerPool.get(getBaseBundleName(pathname), {
      platform: String(query.platform),
      dev: query.dev === 'true',
    });
    const bundle = await bundler.getBundle();

    return symbolicate(bundle, [
      {
        file: bundleUrl,
        lineNumber: line + 1,
        column,
      },
    ]);
  }

  async triggerFullBuild(bundlerId: string): Promise<void> {
    const bundler = this.context.bundlerPool.getInstanceById(bundlerId);
    if (bundler == null) {
      throw new Error(`Bundler not found: ${bundlerId}`);
    }

    setTimeout(() => this.context.message.broadcast('reload'), 0);
    await bundler.triggerFullBuild();
  }

  reload(): void {
    this.context.message.broadcast('reload');
  }

  async resetCache(): Promise<void> {
    await resetCache();
    this.context.eventBus.emit({ type: 'cache_reset' });
  }

  resetBundlerState(): void {
    this.context.state.resetBufferedState();
  }

  dispose(): void {
    this.unsubscribeEventBus?.();
    this.unsubscribeEventBus = undefined;
  }
}

function registerDashboardRpcFunctions(
  rpc: DevframeScopedNodeRpc,
  controller: RollipopDevframeController,
): void {
  rpc.register(
    defineRpcFunction({
      name: 'get-snapshot',
      type: 'query',
      handler: () => controller.getSnapshot(),
    }),
  );
  rpc.register(
    defineRpcFunction({
      name: 'get-builds',
      type: 'query',
      handler: () => controller.getBuilds(),
    }),
  );
  rpc.register(
    defineRpcFunction({
      name: 'get-build-logs',
      type: 'query',
      handler: (bundlerId: string) => controller.getBuildLogs(bundlerId),
    }),
  );
  rpc.register(
    defineRpcFunction({
      name: 'delete-build-logs',
      type: 'action',
      handler: (bundlerId: string) => controller.deleteBuildLogs(bundlerId),
    }),
  );
  rpc.register(
    defineRpcFunction({
      name: 'get-config',
      type: 'query',
      handler: () => controller.getConfig(),
    }),
  );
  rpc.register(
    defineRpcFunction({
      name: 'get-feature-flags',
      type: 'query',
      handler: () => controller.getFeatureFlags(),
    }),
  );
  rpc.register(
    defineRpcFunction({
      name: 'get-device',
      type: 'query',
      handler: (deviceId: string) => controller.getDevice(deviceId),
    }),
  );
  rpc.register(
    defineRpcFunction({
      name: 'symbolicate-bundle-position',
      type: 'query',
      handler: (bundleUrl: string, line: number, column: number) =>
        controller.symbolicateBundlePosition(bundleUrl, line, column),
    }),
  );
  rpc.register(
    defineRpcFunction({
      name: 'trigger-full-build',
      type: 'action',
      handler: (bundlerId: string) => controller.triggerFullBuild(bundlerId),
    }),
  );
  rpc.register(
    defineRpcFunction({
      name: 'reload',
      type: 'action',
      handler: () => controller.reload(),
    }),
  );
  rpc.register(
    defineRpcFunction({
      name: 'reset-cache',
      type: 'action',
      handler: () => controller.resetCache(),
    }),
  );
  rpc.register(
    defineRpcFunction({
      name: 'reset-bundler-state',
      type: 'action',
      handler: () => controller.resetBundlerState(),
    }),
  );
}
