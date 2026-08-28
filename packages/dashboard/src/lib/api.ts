import { connectDevframe } from 'devframe/client';

import type {
  Build,
  BuildLog,
  ConnectedDevice,
  DashboardConfig,
  DashboardSnapshot,
  FeatureFlags,
  SymbolicateResult,
} from '../types/dashboard';

export const SERVER_BASE_URL = normalizeServerBaseUrl(
  import.meta.env.VITE_ROLLIPOP_SERVER_BASE_URL,
);
export const ROLLIPOP_DEVFRAME_BASE = '/__rollipop/';

export interface DashboardSharedState {
  snapshot: DashboardSnapshot;
  builds: Build[];
  featureFlags: FeatureFlags;
  lastEvent: {
    sequence: number;
    data: DashboardEvent;
  } | null;
}

export interface DashboardEvent {
  type: string;
  bundlerId?: string;
  [key: string]: unknown;
}

type DevframeConnectionStatus =
  | 'connecting'
  | 'connected'
  | 'unauthorized'
  | 'disconnected'
  | 'error';

interface DashboardSharedStateHandle<T extends object> {
  value(): T;
  on(event: 'updated', callback: (value: T) => void): () => void;
}

interface DashboardDevframeClient {
  readonly status: DevframeConnectionStatus;
  ensureTrusted(): Promise<boolean>;
  readonly events: {
    on(
      event: 'connection:status',
      callback: (status: DevframeConnectionStatus) => void,
    ): () => void;
  };
  scope(namespace: string): {
    rpc: {
      call(method: string, ...args: unknown[]): Promise<unknown>;
      sharedState<T extends object>(key: string): Promise<DashboardSharedStateHandle<T>>;
    };
  };
}

let devframeClientPromise: Promise<DashboardDevframeClient> | undefined;

export async function getDashboardSnapshot(): Promise<DashboardSnapshot> {
  return dashboardRpc('get-snapshot');
}
export async function getBuilds(): Promise<Build[]> {
  return dashboardRpc('get-builds');
}
export async function getBuildLogs(bundlerId: string): Promise<BuildLog[]> {
  return dashboardRpc('get-build-logs', bundlerId);
}
export async function deleteBuildLogs(bundlerId: string): Promise<void> {
  await dashboardRpc('delete-build-logs', bundlerId);
}
export async function getConfig(): Promise<DashboardConfig> {
  return dashboardRpc('get-config');
}
export async function getFeatureFlags(): Promise<FeatureFlags> {
  return dashboardRpc('get-feature-flags');
}
export async function getDevice(deviceId: string): Promise<ConnectedDevice> {
  return dashboardRpc('get-device', deviceId);
}
export async function triggerBundlerFullBuild(bundlerId: string): Promise<void> {
  await dashboardRpc('trigger-full-build', bundlerId);
}
export async function reloadDevices(): Promise<void> {
  await dashboardRpc('reload');
}
export async function resetCache(): Promise<void> {
  await dashboardRpc('reset-cache');
}
export async function resetBundlerState(): Promise<void> {
  await dashboardRpc('reset-bundler-state');
}
export async function subscribeDashboardSharedState({
  onState,
  onConnectionStatus,
}: {
  onState: (state: DashboardSharedState) => void;
  onConnectionStatus?: (status: DevframeConnectionStatus) => void;
}): Promise<() => void> {
  const client = await getDevframeClient();
  await client.ensureTrusted();
  const scope = client.scope('rollipop');
  const unsubscribeStatus = client.events.on('connection:status', (status) => {
    onConnectionStatus?.(status);
  });
  const state = await scope.rpc.sharedState<DashboardSharedState>('dashboard');
  const unsubscribeState = state.on('updated', (value) => {
    onState(value);
  });

  onConnectionStatus?.(client.status);
  onState(state.value() as DashboardSharedState);

  return () => {
    unsubscribeState();
    unsubscribeStatus();
  };
}

export async function symbolicateBundlePosition({
  bundleUrl,
  line,
  column,
}: {
  bundleUrl: string;
  line: number;
  column: number;
}): Promise<SymbolicateResult> {
  return dashboardRpc('symbolicate-bundle-position', bundleUrl, line, column);
}
export function getAnalyzeReportUrl(bundlerId: string): string {
  return getServerUrl(`/dashboard/analyze-report/${encodeURIComponent(bundlerId)}.html`);
}

export async function hasAnalyzeReport(bundlerId: string): Promise<boolean> {
  const response = await fetch(getAnalyzeReportUrl(bundlerId), { method: 'HEAD' });

  if (response.ok) {
    return true;
  }

  if (response.status === 404) {
    return false;
  }

  throw new Error(`Analyze report request failed: ${response.status} ${response.statusText}`);
}

async function dashboardRpc<T>(method: string, ...args: unknown[]): Promise<T> {
  if (__ROLLIPOP_MOCK__) {
    const { invokeMockDashboardRpc } = await import('../mocks/mock-store');
    return (await invokeMockDashboardRpc(method, ...args)) as T;
  }

  const client = await getDevframeClient();
  return client.scope('rollipop').rpc.call(method, ...args) as Promise<T>;
}
function getDevframeClient(): Promise<DashboardDevframeClient> {
  devframeClientPromise ??= (
    connectDevframe({
      baseURL: getServerUrl(ROLLIPOP_DEVFRAME_BASE),
      transport: 'sse',
      simpleAuth: false,
      otpParam: false,
      callTimeout: 10_000,
    }) as Promise<DashboardDevframeClient>
  ).catch((error: unknown) => {
    devframeClientPromise = undefined;
    throw error;
  });

  return devframeClientPromise;
}

export function getServerUrl(path: string): string {
  if (SERVER_BASE_URL.length > 0) {
    return `${SERVER_BASE_URL}${path}`;
  }

  if (typeof window === 'undefined') {
    return path;
  }

  return new URL(path, window.location.origin).toString();
}

export function getDevServerResourceUrl(href: string): string {
  if (typeof window === 'undefined') {
    return href;
  }

  try {
    const url = new URL(href, window.location.origin);
    const path = `${url.pathname}${url.search}`;

    return SERVER_BASE_URL.length > 0 ? `${SERVER_BASE_URL}${path}` : path;
  } catch {
    return href;
  }
}

function normalizeServerBaseUrl(value: string | undefined): string {
  const trimmed = value?.trim() ?? '';
  if (trimmed === '/' || trimmed.length === 0) return '';

  return trimmed.replace(/\/+$/, '');
}
