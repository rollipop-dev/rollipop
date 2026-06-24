import type { ResolvedConfig } from '../../config';
import type { BuildOptions } from '../../core/types';
import type { BundlerDevEngine } from '../bundler-pool';
import type { ServerEventBus } from '../events/event-bus';
import type { DevServerContext } from '../types';
import type { McpToolContext } from './tools';
import { AppLogDiagnostics } from './tools/app-log-diagnostics';
import { BuildDiagnostics } from './tools/build-diagnostics';
import { ClientDiagnostics } from './tools/client-diagnostics';

export interface McpRuntimeOptions {
  eventBus: ServerEventBus;
  serverBaseUrl: string;
  config: ResolvedConfig;
  getBundler: (bundleName: string, buildOptions: BuildOptions) => BundlerDevEngine;
  getBundlerById: (id: string) => BundlerDevEngine | undefined;
  reloadApp: () => void;
}

export function createMcpToolContext(context: DevServerContext): McpToolContext {
  return {
    context,
    appLogDiagnostics: new AppLogDiagnostics(context),
    buildDiagnostics: new BuildDiagnostics(context),
    clientDiagnostics: new ClientDiagnostics(context),
  };
}
