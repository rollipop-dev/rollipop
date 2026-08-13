import { type as arkType } from 'arktype';
import type { DevframeAgentHost } from 'devframe';

import type { BuildOptions } from '../../../../core/types';
import { getBaseBundleName } from '../../../../utils/bundle';
import { resetCache } from '../../../../utils/reset-cache';
import { parseUrl } from '../../../../utils/url';
import { symbolicate, type StackFrameInput } from '../../../symbolicate';
import type { DevServerContext } from '../../../types';
import { toDevframeEvent, type DevframeEvent } from '../../events';
import type { AppLogDiagnostics } from './app-log-diagnostics';
import type { BuildDiagnostics } from './build-diagnostics';
import { getBuildInfo } from './build-info';
import type { ClientDiagnostics } from './client-diagnostics';

export interface AgentToolContext {
  context: DevServerContext;
  appLogDiagnostics: AppLogDiagnostics;
  buildDiagnostics: BuildDiagnostics;
  clientDiagnostics: ClientDiagnostics;
}

type ToolArgsSchema<Args extends object> = {
  (data: unknown): Args | { summary: string; [' arkKind']: 'errors' };
  toJsonSchema(): JsonSchemaObject;
};

interface JsonSchemaObject {
  type: 'object';
  properties?: Record<string, object>;
  required?: string[];
  [key: string]: unknown;
}

interface ToolDefinition<Args extends object = Record<string, never>> {
  name: string;
  title: string;
  description: string;
  inputSchema: ToolArgsSchema<Args>;
  handler: (args: Args) => unknown;
}

const emptyArgs = arkType({}) as unknown as ToolArgsSchema<Record<string, never>>;
const durationArgs = arkType({
  duration: 'number >= 1000 & number <= 60000 = 10000',
}) as unknown as ToolArgsSchema<{ duration: number }>;
const bundlerIdArgs = arkType({ bundlerId: 'string' }) as unknown as ToolArgsSchema<{
  bundlerId: string;
}>;
const limitBundlerArgs = arkType({
  limit: 'number >= 1 & number <= 500 = 100',
  'bundlerId?': 'string',
}) as unknown as ToolArgsSchema<{ limit: number; bundlerId?: string }>;
const optionalBundlerIdArgs = arkType({ 'bundlerId?': 'string' }) as unknown as ToolArgsSchema<{
  bundlerId?: string;
}>;
const symbolicateStackArgs = arkType({
  stack: 'unknown[]',
  'bundleUrl?': 'string',
  'bundleName?': 'string',
  'platform?': 'string',
  'dev?': 'boolean',
}) as unknown as ToolArgsSchema<{
  stack: unknown[];
  bundleUrl?: string;
  bundleName?: string;
  platform?: string;
  dev?: boolean;
}>;

export function registerAgentTools(agent: DevframeAgentHost, options: AgentToolContext): void {
  for (const tool of createToolDefinitions(options)) {
    agent.registerTool({
      id: tool.name,
      title: tool.title,
      description: tool.description,
      safety: getToolSafety(tool.name),
      tags: ['rollipop'],
      inputSchema: toAgentInputSchema(tool.inputSchema),
      handler: (args) => tool.handler(parseToolArgs(tool.inputSchema, args ?? {})),
    });
  }
}

function createToolDefinitions(options: AgentToolContext): ToolDefinition<object>[] {
  const { context, appLogDiagnostics, buildDiagnostics, clientDiagnostics } = options;

  return [
    defineTool({
      name: 'reset_cache',
      title: 'Reset Cache',
      description: 'Clear the build cache.',
      inputSchema: emptyArgs,
      async handler() {
        await resetCache();
        context.eventBus.emit({ type: 'cache_reset' });
        return 'Cache cleared successfully.';
      },
    }),
    defineTool({
      name: 'get_build_events',
      title: 'Get Build Events',
      description: 'Collect dev-server events for a duration.',
      inputSchema: durationArgs,
      async handler({ duration }) {
        const events: DevframeEvent[] = [];
        const unsubscribe = context.eventBus.subscribe((event) => {
          const devframeEvent = toDevframeEvent(event);
          if (devframeEvent != null) {
            events.push(devframeEvent);
          }
        });

        await new Promise((resolve) => setTimeout(resolve, duration));
        unsubscribe();

        if (events.length === 0) {
          return 'No events received during the listening period.';
        }

        return events;
      },
    }),
    defineTool({
      name: 'get_bundler_status',
      title: 'Get Bundler Status',
      description: 'Return a bundler status by id.',
      inputSchema: bundlerIdArgs,
      async handler({ bundlerId }) {
        const bundler = context.bundlerPool.getInstanceById(bundlerId);
        if (bundler == null) {
          return { error: 'not found' };
        }
        return { id: bundler.id, status: bundler.status };
      },
    }),
    defineTool({
      name: 'build_logs',
      title: 'Build Logs',
      description: 'Return buffered Rolldown logs.',
      inputSchema: limitBundlerArgs,
      async handler({ limit, bundlerId }) {
        return buildDiagnostics.getBuildLogs({ limit, bundlerId });
      },
    }),
    defineTool({
      name: 'build_errors',
      title: 'Build Errors',
      description: 'Return buffered Rolldown errors.',
      inputSchema: limitBundlerArgs,
      async handler({ limit, bundlerId }) {
        return buildDiagnostics.getBuildErrors({ limit, bundlerId });
      },
    }),
    defineTool({
      name: 'clear_build_logs',
      title: 'Clear Build Logs',
      description: 'Clear buffered Rolldown logs.',
      inputSchema: optionalBundlerIdArgs,
      async handler({ bundlerId }) {
        buildDiagnostics.clearBuildLogs({ bundlerId });
        return { cleared: true };
      },
    }),
    defineTool({
      name: 'clear_build_errors',
      title: 'Clear Build Errors',
      description: 'Clear buffered Rolldown errors.',
      inputSchema: optionalBundlerIdArgs,
      async handler({ bundlerId }) {
        buildDiagnostics.clearBuildErrors({ bundlerId });
        return { cleared: true };
      },
    }),
    defineTool({
      name: 'clear_build_diagnostics',
      title: 'Clear Build Diagnostics',
      description: 'Clear buffered Rolldown diagnostics.',
      inputSchema: optionalBundlerIdArgs,
      async handler({ bundlerId }) {
        buildDiagnostics.clearBuildDiagnostics({ bundlerId });
        return { cleared: true };
      },
    }),
    defineTool({
      name: 'get_console_logs',
      title: 'Get Console Logs',
      description: 'Return buffered app logs.',
      inputSchema: limitBundlerArgs,
      async handler({ limit, bundlerId }) {
        return appLogDiagnostics.getConsoleLogs({ limit, bundlerId });
      },
    }),
    defineTool({
      name: 'clear_console_logs',
      title: 'Clear Console Logs',
      description: 'Clear buffered app logs.',
      inputSchema: optionalBundlerIdArgs,
      async handler({ bundlerId }) {
        appLogDiagnostics.clearConsoleLogs({ bundlerId });
        return { cleared: true };
      },
    }),
    defineTool({
      name: 'list_clients',
      title: 'List Clients',
      description: 'Return known HMR clients.',
      inputSchema: emptyArgs,
      async handler() {
        return clientDiagnostics.getClients();
      },
    }),
    defineTool({
      name: 'reload',
      title: 'Reload App',
      description: 'Reload connected apps.',
      inputSchema: emptyArgs,
      async handler() {
        context.message.broadcast('reload');
        return { reloaded: true, clients: clientDiagnostics.getClients() };
      },
    }),
    defineTool({
      name: 'get_build_info',
      title: 'Get Build Info',
      description: 'Return Rollipop build config.',
      inputSchema: optionalBundlerIdArgs,
      async handler({ bundlerId }) {
        const bundler =
          bundlerId != null ? context.bundlerPool.getInstanceById(bundlerId) : undefined;

        return {
          ...getBuildInfo(context.config),
          bundler: bundler != null ? { id: bundler.id, status: bundler.status } : undefined,
        };
      },
    }),
    defineTool({
      name: 'symbolicate_stack',
      title: 'Symbolicate Stack',
      description: 'Symbolicate React Native stack frames.',
      inputSchema: symbolicateStackArgs,
      async handler({ stack, bundleUrl, bundleName, platform, dev }) {
        const buildOptions = resolveSymbolicateBuildOptions(stack as StackFrameInput[], {
          bundleUrl,
          bundleName,
          platform,
          dev,
        });
        const bundler = context.bundlerPool.get(buildOptions.bundleName, buildOptions);
        const bundle = await bundler.getBundle();
        return await symbolicate(bundle, stack as StackFrameInput[]);
      },
    }),
  ];
}

function defineTool<Args extends object>(definition: ToolDefinition<Args>): ToolDefinition<object> {
  return definition as unknown as ToolDefinition<object>;
}

function parseToolArgs<Args extends object>(schema: ToolArgsSchema<Args>, args: unknown): Args {
  const result = schema(args);
  if (isArkErrors(result)) {
    throw new Error(result.summary);
  }
  return result;
}

function isArkErrors(value: unknown): value is { summary: string; [' arkKind']: 'errors' } {
  return (
    typeof value === 'object' &&
    value != null &&
    ' arkKind' in value &&
    value[' arkKind'] === 'errors'
  );
}

function toAgentInputSchema(schema: ToolArgsSchema<object>): JsonSchemaObject {
  const { $schema: _schema, type: _type, ...jsonSchema } = schema.toJsonSchema();
  return {
    type: 'object',
    ...jsonSchema,
  };
}

function getToolSafety(name: string): 'read' | 'action' | 'destructive' {
  if (name.startsWith('clear_') || name === 'reset_cache') {
    return 'destructive';
  }

  if (name === 'reload') {
    return 'action';
  }

  return 'read';
}

function resolveSymbolicateBuildOptions(
  stack: StackFrameInput[],
  options: {
    bundleUrl?: string;
    bundleName?: string;
    platform?: string;
    dev?: boolean;
  },
): BuildOptions & { bundleName: string } {
  const file = options.bundleUrl ?? stack.find((frame) => frame.file?.startsWith('http'))?.file;

  if (file != null) {
    const { pathname, query } = parseUrl(file);
    if (pathname == null || query.platform == null || query.dev == null) {
      throw new Error('Bundle URL must include pathname, platform, and dev query parameters');
    }

    return {
      bundleName: getBaseBundleName(pathname),
      platform: String(query.platform),
      dev: query.dev === 'true',
    };
  }

  if (options.bundleName == null || options.platform == null || options.dev == null) {
    throw new Error(
      'bundleName, platform, and dev are required when stack frames do not include a bundle URL',
    );
  }

  return {
    bundleName: options.bundleName,
    platform: options.platform,
    dev: options.dev,
  };
}
