import { defineDevframe, defineRpcFunction, type DevframeScopedNodeRpc } from 'devframe';

import { getBaseBundleName } from '../../utils/bundle';
import { resetCache } from '../../utils/reset-cache';
import { parseUrl } from '../../utils/url';
import { symbolicate } from '../symbolicate';
import type { DevServerContext } from '../types';
import { registerAgentTools, type AgentToolContext } from './agent/tools';
import {
  getBuildSummary,
  getBundlers,
  getConfigInfo,
  getDevice,
  getFeatureFlags,
  getProjectInfo,
  getSnapshot,
  type Snapshot,
} from './data';
import { toDevframeEvent, type DevframeEvent } from './events';

export const ROLLIPOP_DEVFRAME_BASE = '/__rollipop/';
export const ROLLIPOP_DEVFRAME_SCOPE = 'rollipop';
export const DASHBOARD_SHARED_STATE_KEY = 'dashboard';

export interface DashboardSharedState {
  snapshot: Snapshot;
  builds: ReturnType<DevServerContext['state']['getBuilds']>;
  featureFlags: ReturnType<typeof getFeatureFlags>;
  lastEvent: {
    sequence: number;
    data: DevframeEvent;
  } | null;
}

export class RollipopDevframeController {
  private sequence = 0;
  private lastEvent: DashboardSharedState['lastEvent'] = null;
  private updateSharedState?: (state: DashboardSharedState) => void;
  private unsubscribeEventBus?: () => void;
  private refreshQueue: Promise<DashboardSharedState>;

  readonly definition;

  constructor(
    private readonly context: DevServerContext,
    agentToolContext: AgentToolContext,
  ) {
    const initialState = createInitialDashboardState(context);
    this.refreshQueue = Promise.resolve(initialState);
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
        const sharedState = await scope.rpc.sharedState<DashboardSharedState>(
          DASHBOARD_SHARED_STATE_KEY,
          { initialValue: initialState },
        );

        this.updateSharedState = (state) => {
          sharedState.mutate((current) => {
            current.snapshot = state.snapshot;
            current.builds = state.builds;
            current.featureFlags = state.featureFlags;
            current.lastEvent = state.lastEvent;
          });
        };

        registerDashboardRpcFunctions(scope.rpc, this);
        registerAgentTools(devframeContext.agent, agentToolContext);

        this.unsubscribeEventBus = context.eventBus.subscribe((event) => {
          const data = toDevframeEvent(event);
          if (data == null) return;

          this.lastEvent = { sequence: ++this.sequence, data };
          void this.refresh();
        });
      },
    });
  }

  async refresh(): Promise<DashboardSharedState> {
    this.refreshQueue = this.refreshQueue
      .catch(() => createInitialDashboardState(this.context))
      .then(async () => {
        const state = await this.readDashboardState();
        this.updateSharedState?.(state);
        return state;
      });

    return this.refreshQueue;
  }

  async getSnapshot(): Promise<Snapshot> {
    return (await this.refresh()).snapshot;
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

  async deleteBuildLogs(bundlerId: string): Promise<void> {
    const deleted = this.context.state.clearBuildLogs(bundlerId);
    if (!deleted && this.context.bundlerPool.getInstanceById(bundlerId) == null) {
      throw new Error(`Build logs not found: ${bundlerId}`);
    }

    await this.refresh();
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
    await this.refresh();
  }

  async reload(): Promise<void> {
    this.context.message.broadcast('reload');
    await this.refresh();
  }

  async resetCache(): Promise<void> {
    await resetCache();
    this.context.eventBus.emit({ type: 'cache_reset' });
    await this.refresh();
  }

  async resetBundlerState(): Promise<void> {
    this.context.state.resetBufferedState();
    await this.refresh();
  }

  dispose(): void {
    this.unsubscribeEventBus?.();
    this.unsubscribeEventBus = undefined;
  }

  private async readDashboardState(): Promise<DashboardSharedState> {
    return {
      snapshot: await getSnapshot(this.context),
      builds: this.context.state.getBuilds(),
      featureFlags: getFeatureFlags(this.context),
      lastEvent: this.lastEvent,
    };
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

function createInitialDashboardState(context: DevServerContext): DashboardSharedState {
  return {
    snapshot: {
      project: getProjectInfo(context),
      bundlers: getBundlers(context),
      devices: [],
      buildSummary: getBuildSummary(context),
    },
    builds: context.state.getBuilds(),
    featureFlags: getFeatureFlags(context),
    lastEvent: null,
  };
}
