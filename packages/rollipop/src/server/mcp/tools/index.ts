import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
  type CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';
import { type as arkType } from 'arktype';

import type { BuildOptions } from '../../../core/types';
import { getBaseBundleName } from '../../../utils/bundle';
import { resetCache } from '../../../utils/reset-cache';
import { parseUrl } from '../../../utils/url';
import { toSSEEvent } from '../../sse/adapter';
import type { SSEBuildEvent } from '../../sse/types';
import { symbolicate, type StackFrameInput } from '../../symbolicate';
import type { DevServerContext } from '../../types';
import type { AppLogDiagnostics } from './app-log-diagnostics';
import type { BuildDiagnostics } from './build-diagnostics';
import { getBuildInfo } from './build-info';
import type { ClientDiagnostics } from './client-diagnostics';

export interface McpToolContext {
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
  handler: (args: Args) => Promise<CallToolResult> | CallToolResult;
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

export function registerTools(server: McpServer, options: McpToolContext): void {
  const { context, appLogDiagnostics, buildDiagnostics, clientDiagnostics } = options;

  const tools = [
    defineTool({
      name: 'reset_cache',
      title: 'Reset Cache',
      description: 'Clear the build cache.',
      inputSchema: emptyArgs,
      async handler() {
        resetCache(context.config.root);
        context.eventBus.emit({ type: 'cache_reset' });
        return textResult('Cache cleared successfully.');
      },
    }),
    defineTool({
      name: 'get_build_events',
      title: 'Get Build Events',
      description: 'Collect dev-server events for a duration.',
      inputSchema: durationArgs,
      async handler({ duration }) {
        const events: SSEBuildEvent[] = [];
        const unsubscribe = context.eventBus.subscribe((event) => {
          const sseEvent = toSSEEvent(event);
          if (sseEvent != null) {
            events.push(sseEvent);
          }
        });

        await new Promise((resolve) => setTimeout(resolve, duration));
        unsubscribe();

        if (events.length === 0) {
          return textResult('No events received during the listening period.');
        }

        return jsonResult(events);
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
          return jsonResult({ error: 'not found' });
        }
        return jsonResult({ id: bundler.id, status: bundler.status });
      },
    }),
    defineTool({
      name: 'build_logs',
      title: 'Build Logs',
      description: 'Return buffered Rolldown logs.',
      inputSchema: limitBundlerArgs,
      async handler({ limit, bundlerId }) {
        return jsonResult(buildDiagnostics.getBuildLogs({ limit, bundlerId }));
      },
    }),
    defineTool({
      name: 'build_errors',
      title: 'Build Errors',
      description: 'Return buffered Rolldown errors.',
      inputSchema: limitBundlerArgs,
      async handler({ limit, bundlerId }) {
        return jsonResult(buildDiagnostics.getBuildErrors({ limit, bundlerId }));
      },
    }),
    defineTool({
      name: 'clear_build_logs',
      title: 'Clear Build Logs',
      description: 'Clear buffered Rolldown logs.',
      inputSchema: optionalBundlerIdArgs,
      async handler({ bundlerId }) {
        buildDiagnostics.clearBuildLogs({ bundlerId });
        return jsonResult({ cleared: true });
      },
    }),
    defineTool({
      name: 'clear_build_errors',
      title: 'Clear Build Errors',
      description: 'Clear buffered Rolldown errors.',
      inputSchema: optionalBundlerIdArgs,
      async handler({ bundlerId }) {
        buildDiagnostics.clearBuildErrors({ bundlerId });
        return jsonResult({ cleared: true });
      },
    }),
    defineTool({
      name: 'clear_build_diagnostics',
      title: 'Clear Build Diagnostics',
      description: 'Clear buffered Rolldown diagnostics.',
      inputSchema: optionalBundlerIdArgs,
      async handler({ bundlerId }) {
        buildDiagnostics.clearBuildDiagnostics({ bundlerId });
        return jsonResult({ cleared: true });
      },
    }),
    defineTool({
      name: 'get_console_logs',
      title: 'Get Console Logs',
      description: 'Return buffered app logs.',
      inputSchema: limitBundlerArgs,
      async handler({ limit, bundlerId }) {
        return jsonResult(appLogDiagnostics.getConsoleLogs({ limit, bundlerId }));
      },
    }),
    defineTool({
      name: 'clear_console_logs',
      title: 'Clear Console Logs',
      description: 'Clear buffered app logs.',
      inputSchema: optionalBundlerIdArgs,
      async handler({ bundlerId }) {
        appLogDiagnostics.clearConsoleLogs({ bundlerId });
        return jsonResult({ cleared: true });
      },
    }),
    defineTool({
      name: 'list_clients',
      title: 'List Clients',
      description: 'Return known HMR clients.',
      inputSchema: emptyArgs,
      async handler() {
        return jsonResult(clientDiagnostics.getClients());
      },
    }),
    defineTool({
      name: 'reload',
      title: 'Reload App',
      description: 'Reload connected apps.',
      inputSchema: emptyArgs,
      async handler() {
        context.message.broadcast('reload');
        return jsonResult({ reloaded: true, clients: clientDiagnostics.getClients() });
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

        return jsonResult({
          ...getBuildInfo(context.config),
          bundler: bundler != null ? { id: bundler.id, status: bundler.status } : undefined,
        });
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
        return jsonResult(await symbolicate(bundle, stack as StackFrameInput[]));
      },
    }),
  ];

  const toolsByName = new Map(tools.map((tool) => [tool.name, tool]));

  server.server.registerCapabilities({ tools: { listChanged: true } });
  server.server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: tools.map((tool) => ({
      name: tool.name,
      title: tool.title,
      description: tool.description,
      inputSchema: toMcpInputSchema(tool.inputSchema),
    })),
  }));
  server.server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      const tool = toolsByName.get(request.params.name);
      if (tool == null) {
        throw new McpError(ErrorCode.InvalidParams, `Tool ${request.params.name} not found`);
      }

      const args = parseToolArgs(tool.inputSchema, request.params.arguments ?? {});
      return await tool.handler(args);
    } catch (error) {
      return errorResult(error instanceof Error ? error.message : String(error));
    }
  });
}

function defineTool<Args extends object>(definition: ToolDefinition<Args>): ToolDefinition<object> {
  return definition as unknown as ToolDefinition<object>;
}

function parseToolArgs<Args extends object>(schema: ToolArgsSchema<Args>, args: unknown): Args {
  const result = schema(args);
  if (isArkErrors(result)) {
    throw new McpError(ErrorCode.InvalidParams, result.summary);
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

function toMcpInputSchema(schema: ToolArgsSchema<object>): JsonSchemaObject {
  const { $schema: _schema, type: _type, ...jsonSchema } = schema.toJsonSchema();
  return {
    type: 'object',
    ...jsonSchema,
  };
}

function textResult(text: string): CallToolResult {
  return {
    content: [{ type: 'text' as const, text }],
  };
}

function errorResult(text: string): CallToolResult {
  return {
    content: [{ type: 'text' as const, text }],
    isError: true,
  };
}

function jsonResult(value: unknown): CallToolResult {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
  };
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
