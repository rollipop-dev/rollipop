import type {
  Build,
  BuildLog,
  ConnectedDevice,
  DashboardConfig,
  DashboardSnapshot,
  FeatureFlags,
  SymbolicateResult,
} from '../types/dashboard';

export const API_BASE_URL = normalizeApiBaseUrl(import.meta.env.VITE_ROLLIPOP_API_BASE_URL);

export async function getDashboardSnapshot(): Promise<DashboardSnapshot> {
  return apiRequest('/api/snapshot');
}

export async function getBuilds(): Promise<Build[]> {
  return apiRequest('/api/builds');
}

export async function getBuildLogs(bundlerId: string): Promise<BuildLog[]> {
  return apiRequest(`/api/builds/${encodeURIComponent(bundlerId)}/logs`);
}

export async function deleteBuildLogs(bundlerId: string): Promise<void> {
  await apiRequest(`/api/builds/${encodeURIComponent(bundlerId)}/logs`, { method: 'DELETE' });
}

export async function getConfig(): Promise<DashboardConfig> {
  return apiRequest('/api/config');
}

export async function getFeatureFlags(): Promise<FeatureFlags> {
  return apiRequest('/api/feature-flags');
}

export async function getDevice(deviceId: string): Promise<ConnectedDevice> {
  return apiRequest(`/api/devices/${encodeURIComponent(deviceId)}`);
}

export async function triggerBundlerFullBuild(bundlerId: string): Promise<void> {
  await apiRequest(`/api/bundlers/${encodeURIComponent(bundlerId)}/trigger-full-build`, {
    method: 'POST',
  });
}

export async function reloadDevices(): Promise<void> {
  await apiRequest('/api/actions/reload', { method: 'POST' });
}

export async function resetCache(): Promise<void> {
  await apiRequest('/api/actions/reset-cache', { method: 'POST' });
}

export async function resetBundlerState(): Promise<void> {
  await apiRequest('/api/actions/reset-bundler-state', { method: 'POST' });
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
  return apiRequest('/symbolicate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      stack: [
        {
          file: bundleUrl,
          lineNumber: line + 1,
          column,
        },
      ],
    }),
  });
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

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(getServerUrl(path), init);
  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      readErrorMessage(text) ?? `Request failed: ${response.status} ${response.statusText}`,
    );
  }

  return (text.length === 0 ? undefined : JSON.parse(text)) as T;
}

export function getServerUrl(path: string): string {
  if (API_BASE_URL.length > 0) {
    return `${API_BASE_URL}${path}`;
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

    return API_BASE_URL.length > 0 ? `${API_BASE_URL}${path}` : path;
  } catch {
    return href;
  }
}

function normalizeApiBaseUrl(value: string | undefined): string {
  const trimmed = value?.trim() ?? '';
  if (trimmed === '/' || trimmed.length === 0) return '';

  return trimmed.replace(/\/+$/, '');
}

function readErrorMessage(text: string): string | null {
  if (text.length === 0) return null;

  try {
    const body = JSON.parse(text) as { error?: { message?: unknown } };

    return typeof body.error?.message === 'string' ? body.error.message : null;
  } catch {
    return null;
  }
}
