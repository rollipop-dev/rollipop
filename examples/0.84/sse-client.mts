/**
 * Rollipop SSE Client Example
 *
 * Connects to the rollipop dev server's SSE endpoint and prints
 * bundler events to the terminal in real-time.
 *
 * Usage:
 *   node --import @oxc-node/core/register examples/0.84/sse-client.mts
 *   node --import @oxc-node/core/register examples/0.84/sse-client.mts 8082
 *   node --import @oxc-node/core/register examples/0.84/sse-client.mts 8081 192.168.0.1
 *
 * Use MCP tools such as reset_cache and get_bundler_status for actions and
 * point-in-time state queries.
 */

import http from 'node:http';

import pc from 'picocolors';
import type { SSEEvent } from 'rollipop';

const port = Number(process.argv[2] || '8081');
const host = process.argv[3] || 'localhost';
const url = `http://${host}:${port}/sse/events`;

const EVENT_STYLES: Record<SSEEvent['type'], { label: string; color: (s: string) => string }> = {
  server_ready: { label: 'ready', color: pc.green },
  bundle_build_started: { label: 'build:start', color: pc.blue },
  bundle_build_done: { label: 'build:done', color: pc.green },
  bundle_build_failed: { label: 'build:fail', color: pc.red },
  hmr_failed: { label: 'hmr:fail', color: pc.red },
  watch_change: { label: 'watch', color: pc.yellow },
  client_log: { label: 'log', color: pc.cyan },
  device_connected: { label: 'device:on', color: pc.green },
  device_disconnected: { label: 'device:off', color: pc.red },
  cache_reset: { label: 'cache:reset', color: pc.yellow },
};

function timestamp(): string {
  return pc.dim(new Date().toLocaleTimeString('en-GB', { hour12: false }));
}

function formatEvent(eventType: string, data: SSEEvent): string {
  const style = EVENT_STYLES[eventType as SSEEvent['type']] ?? {
    label: eventType,
    color: pc.gray,
  };
  const { type: _, ...rest } = data;
  const detail = Object.keys(rest).length > 0 ? ` ${pc.dim(JSON.stringify(rest))}` : '';
  return `${timestamp()} ${style.color(style.label)}${detail}`;
}

function handleSSEChunk(chunk: string): string {
  const messages = chunk.split('\n\n');
  const remaining = messages.pop() || '';

  for (const message of messages) {
    if (!message.trim() || message.startsWith(':')) continue;

    let eventType = '';
    let data = '';

    for (const line of message.split('\n')) {
      if (line.startsWith('event: ')) eventType = line.slice(7);
      if (line.startsWith('data: ')) data = line.slice(6);
    }

    if (!eventType || !data) continue;

    try {
      const parsed = JSON.parse(data) as SSEEvent;
      console.log(formatEvent(eventType, parsed));
    } catch {
      console.log(`${timestamp()} ${pc.dim(`[raw] ${data}`)}`);
    }
  }

  return remaining;
}

function connect(): void {
  console.log(`${timestamp()} Connecting to ${pc.cyan(url)}...`);
  console.log(`${timestamp()} ${pc.dim('Press Ctrl+C to exit')}`);
  console.log();

  const req = http.get(
    { hostname: host, port, path: '/sse/events', headers: { Accept: 'text/event-stream' } },
    (res) => {
      if (res.statusCode !== 200) {
        console.error(`${timestamp()} ${pc.red(`HTTP ${res.statusCode}: ${res.statusMessage}`)}`);
        retry();
        return;
      }

      console.log(`${timestamp()} ${pc.green('Connected')}`);
      console.log();

      let buffer = '';

      res.setEncoding('utf8');
      res.on('data', (chunk: string) => {
        buffer += chunk;
        buffer = handleSSEChunk(buffer);
      });

      res.on('end', () => {
        console.log();
        console.log(`${timestamp()} ${pc.yellow('Connection closed')}`);
        retry();
      });
    },
  );

  req.on('error', (error) => {
    console.error(`${timestamp()} ${pc.red(`Connection failed: ${error.message}`)}`);
    retry();
  });
}

function retry(): void {
  console.log(`${timestamp()} ${pc.dim('Reconnecting in 3s...')}`);
  setTimeout(connect, 3000);
}

connect();
