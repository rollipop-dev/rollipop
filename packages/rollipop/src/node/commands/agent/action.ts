import { DEFAULT_HOST, DEFAULT_PORT } from '../../../server';
import type { CommandAction } from '../../types';

export type AgentCommandOptions = Record<string, never>;

const defaultBaseUrl = `http://${DEFAULT_HOST}:${DEFAULT_PORT}`;

export function getAgentGuide(baseUrl = defaultBaseUrl): string {
  return [
    'Rollipop Agent Guide',
    '',
    'Rollipop exposes build and runtime diagnostics through SSE and MCP.',
    'Keep the dev server running, then connect your agent to one of these endpoints.',
    '',
    'Start the dev server:',
    '',
    '  rollipop start --reset-cache',
    '',
    'Default endpoints:',
    '',
    `  SSE events:      ${baseUrl}/sse/events`,
    `  MCP server:      ${baseUrl}/mcp`,
    `  Reset cache:     ${baseUrl}/reset-cache`,
    `  Bundler status:  ${baseUrl}/bundlers/<id>/status`,
    '',
    'If you start Rollipop with custom --host, --port, or --https options,',
    'adjust these URLs to match the running dev server.',
    '',
    'SSE usage:',
    '',
    `  curl -N ${baseUrl}/sse/events`,
    '',
    '  Event format:',
    '    event: <event_type>',
    '    data: <json_payload>',
    '    bundler-scoped events include bundlerId',
    '',
    '  Useful event types:',
    '    bundle_build_started, bundle_build_done, bundle_build_failed',
    '    watch_change, client_log, device_connected, device_disconnected',
    '    server_ready, cache_reset',
    '',
    'MCP setup:',
    '',
    '  Add this to your project .mcp.json:',
    '',
    '    {',
    '      "mcpServers": {',
    '        "rollipop": {',
    '          "type": "http",',
    `          "url": "${baseUrl}/mcp"`,
    '        }',
    '      }',
    '    }',
    '',
    '  Available tools:',
    '    get_build_events({ "duration": 10000 })',
    '    reset_cache()',
    '',
    'Agent workflow:',
    '',
    '  1. Run rollipop start and keep it running.',
    '  2. Use get_build_events or subscribe to SSE before and after edits.',
    '  3. Wait for bundle_build_done or bundle_build_failed.',
    '  4. If the build fails, inspect the error payload, fix the code, and repeat.',
    '  5. Use reset_cache or /reset-cache when stale cache is suspected.',
  ].join('\n');
}

export const action: CommandAction<AgentCommandOptions> = async () => {
  console.log(getAgentGuide());
};
