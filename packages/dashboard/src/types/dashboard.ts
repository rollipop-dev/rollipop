import type { ComponentType, SVGProps } from 'react';

export type Icon = ComponentType<SVGProps<SVGSVGElement>>;
export type Theme = 'light' | 'dark';
export type BundlerStatus = 'idle' | 'building' | 'build-done' | 'build-failed';
export type BuildStatus = 'pending' | 'success' | 'failed';
export type LogLevel = 'info' | 'warn' | 'error';

export interface ProjectInfo {
  bundlerVersion: string;
  rootPath: string;
  configPath: string | null;
  server: {
    host: string;
    port: number;
    status: 'listening' | 'closed';
    startedAt: string;
    uptimeMs: number;
  };
}

export interface DashboardConfig {
  path: string | null;
  resolved: unknown;
  serialized: string;
}

export interface FeatureFlags {
  analyze: boolean;
}

export interface BundlerInstance {
  id: string;
  platform: string;
  dev: boolean;
  entry: string;
  status: BundlerStatus;
  bundleUrl: string;
  sourceMapUrl: string;
  buildOptions: {
    dev: boolean;
    platform: string;
    minify: boolean;
  };
}

export interface ConnectedDevice {
  id: string;
  name: string;
  debuggerUrl?: string;
  debugTarget?: DeviceDebugTarget;
}

export interface DeviceDebugTarget {
  id?: string;
  title?: string;
  description?: string;
  type?: string;
  devtoolsFrontendUrl?: string;
  webSocketDebuggerUrl?: string;
  [key: string]: unknown;
}

export interface BuildLog {
  id: string;
  level: LogLevel;
  source: string;
  message: string;
  timestamp: string;
}

export interface BuildMessages {
  info: number;
  warn: number;
  error: number;
}

export interface Build {
  id: string;
  bundlerId: string;
  startedAt: string;
  endedAt: string | null;
  durationMs: number | null;
  status: BuildStatus;
  messages: BuildMessages;
}

export interface SymbolicateStackFrame {
  file?: string;
  lineNumber?: number;
  column?: number;
  methodName?: string;
  collapse?: boolean;
}

export interface SymbolicateCodeFrame {
  content: string;
  location: {
    column: number;
    row: number;
  };
  fileName: string;
}

export interface SymbolicateResult {
  stack: SymbolicateStackFrame[];
  codeFrame?: SymbolicateCodeFrame | null;
}

export interface DashboardSnapshot {
  project: ProjectInfo;
  bundlers: BundlerInstance[];
  devices: ConnectedDevice[];
  buildSummary: {
    count: number;
    latest: Build | null;
  };
}
