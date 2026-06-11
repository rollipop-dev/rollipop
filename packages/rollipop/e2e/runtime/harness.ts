import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';

import WebSocket from 'ws';

import { loadConfig } from '../../src/config';
import type { ResolvedConfig } from '../../src/config/defaults';
import type { SSEEvent } from '../../src/server/sse/types';
import type { DevServer } from '../../src/server/types';
import type { HMRClientLogLevel, HMRClientMessage, HMRServerMessage } from '../../src/types/hmr';
import { runServer } from '../../src/utils/run-server';

const FIXTURES_DIR = path.resolve(import.meta.dirname, '__fixtures__');
const EXAMPLE_DIR = path.resolve(import.meta.dirname, '../../../../examples/0.84');

/**
 * Copy a fixture into a unique directory under `examples/0.84/` so the
 * resulting project can resolve `react-native` (and related deps) from the
 * example workspace's node_modules. Each call returns a fresh path →
 * guarantees a distinct BundlerPool cache key across tests.
 */
export function cloneFixture(name: string): { dir: string; cleanup: () => void } {
  const src = path.join(FIXTURES_DIR, name);
  const dirName = `rollipop-e2e-${process.pid}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const dir = path.join(EXAMPLE_DIR, dirName);

  fs.cpSync(src, dir, { recursive: true });

  const cleanup = () => {
    fs.rmSync(dir, { recursive: true, force: true });
  };

  return { dir, cleanup };
}

/**
 * Reserve a random free port by binding to :0 and immediately closing.
 * Race-free enough for test concurrency within a single process.
 */
export function pickPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (typeof address === 'object' && address) {
        const { port } = address;
        server.close(() => resolve(port));
      } else {
        server.close();
        reject(new Error('Failed to pick a port'));
      }
    });
  });
}

export interface TestServer {
  server: DevServer;
  config: ResolvedConfig;
  root: string;
  host: string;
  port: number;
  baseUrl: string;
  entryAbs: string;
  close: () => Promise<void>;
}

export async function startTestServer(fixtureDir: string): Promise<TestServer> {
  const host = '127.0.0.1';
  const port = await pickPort();

  const config = await loadConfig({ cwd: fixtureDir, mode: 'development' });

  // Mirror the workaround used by server.spec.ts: the prelude plugin reads
  // entry via fs.readFileSync, which requires an absolute path.
  const entryAbs = path.resolve(config.root, config.entry);
  (config as any).entry = entryAbs;

  // Silence terminal reporter in tests.
  (config as any).terminal = { status: 'none' };

  const server = await runServer(config, {
    host,
    port,
    buildOptions: { cache: false },
  });

  const close = async () => {
    try {
      await server.instance.close();
    } catch {
      // ignore double-close
    }
  };

  return {
    server,
    config,
    root: fixtureDir,
    host,
    port,
    baseUrl: `http://${host}:${port}`,
    entryAbs,
    close,
  };
}

/* -------------------------------------------------------------------------- */
/* SSE subscriber                                                             */
/* -------------------------------------------------------------------------- */

export interface SSESubscription {
  events: SSEEvent[];
  /** Resolves when a matching event arrives, or rejects on timeout. */
  waitFor<T extends SSEEvent['type']>(
    type: T,
    predicate?: (event: Extract<SSEEvent, { type: T }>) => boolean,
    timeoutMs?: number,
  ): Promise<Extract<SSEEvent, { type: T }>>;
  close: () => void;
}

/**
 * Subscribe to one of the dev server's SSE endpoints using `http.get`. We
 * use the raw http module (rather than global fetch) because its streaming
 * semantics for `text/event-stream` are predictable across Node versions —
 * `res` is a Readable that emits `data` events immediately as the server
 * flushes writes.
 */
export async function subscribeSSE(
  baseUrl: string,
  endpoint = '/sse/events',
): Promise<SSESubscription> {
  const url = new URL(endpoint, baseUrl);

  const events: SSEEvent[] = [];
  const listeners = new Set<(event: SSEEvent) => void>();
  let buffer = '';
  let closed = false;

  const processChunk = () => {
    let idx: number;
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const raw = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);

      const dataLine = raw.split('\n').find((line) => line.startsWith('data:'));
      if (!dataLine) continue;

      try {
        const parsed = JSON.parse(dataLine.slice(5).trim()) as SSEEvent;
        events.push(parsed);
        for (const l of listeners) l(parsed);
      } catch {
        // ignore non-JSON comments / heartbeats
      }
    }
  };

  const response = await new Promise<http.IncomingMessage>((resolve, reject) => {
    const req = http.get(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        headers: { accept: 'text/event-stream' },
      },
      (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`Failed to open SSE stream: ${res.statusCode}`));
          res.resume();
          return;
        }
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => {
          buffer += chunk;
          processChunk();
        });
        res.on('error', () => {
          closed = true;
        });
        res.on('close', () => {
          closed = true;
        });
        resolve(res);
      },
    );
    req.on('error', reject);
  });

  const waitFor: SSESubscription['waitFor'] = (type, predicate, timeoutMs = 30_000) => {
    // Check already-received events first.
    const existing = events.find(
      (e) => e.type === type && (predicate ? predicate(e as any) : true),
    );
    if (existing) return Promise.resolve(existing as any);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        listeners.delete(onEvent);
        reject(
          new Error(
            `Timed out after ${timeoutMs}ms waiting for SSE event "${type}". ` +
              `Received: ${events.map((e) => e.type).join(', ') || '(none)'}`,
          ),
        );
      }, timeoutMs);

      const onEvent = (event: SSEEvent) => {
        if (event.type !== type) return;
        if (predicate && !predicate(event as any)) return;
        clearTimeout(timer);
        listeners.delete(onEvent);
        resolve(event as any);
      };

      listeners.add(onEvent);
    });
  };

  const close = () => {
    if (closed) return;
    closed = true;
    response.destroy();
  };

  return { events, waitFor, close };
}

/* -------------------------------------------------------------------------- */
/* Fake HMR WebSocket client                                                  */
/* -------------------------------------------------------------------------- */

export interface FakeClientOptions {
  baseUrl: string;
  platform: 'ios' | 'android';
  /**
   * Matches the `bundleEntry` field sent in `hmr:connected`. The server maps
   * this (via getBaseBundleName) onto the BundlerPool cache key, so it must
   * agree with whatever path the `/:name.bundle` HTTP route uses. Default
   * `"index.bundle"` shares the pool instance with `/index.bundle` requests.
   */
  bundleEntry?: string;
}

export interface FakeClient {
  ws: WebSocket;
  messages: HMRServerMessage[];
  sendLog: (level: HMRClientLogLevel, ...data: unknown[]) => void;
  sendRaw: (message: HMRClientMessage) => void;
  invalidate: (moduleId: string) => void;
  /**
   * Register module IDs (absolute file paths) with the server so rolldown's
   * dev engine knows which modules this fake client has "loaded". Without
   * this, incremental updates collapse to `Noop` and the dev engine never
   * dispatches a concrete Patch or FullReload to the socket.
   */
  registerModules: (modules: string[]) => void;
  waitForMessage<T extends HMRServerMessage['type']>(
    type: T,
    predicate?: (message: Extract<HMRServerMessage, { type: T }>) => boolean,
    timeoutMs?: number,
  ): Promise<Extract<HMRServerMessage, { type: T }>>;
  close: () => Promise<void>;
}

export async function createFakeClient({
  baseUrl,
  platform,
  bundleEntry = 'index.bundle',
}: FakeClientOptions): Promise<FakeClient> {
  const wsUrl = baseUrl.replace(/^http/, 'ws') + '/hot';
  const ws = new WebSocket(wsUrl);

  const messages: HMRServerMessage[] = [];
  const listeners = new Set<(message: HMRServerMessage) => void>();

  ws.on('message', (raw: Buffer | ArrayBuffer | Buffer[]) => {
    try {
      let buf: Buffer;
      if (Array.isArray(raw)) {
        buf = Buffer.concat(raw);
      } else if (raw instanceof Buffer) {
        buf = raw;
      } else {
        buf = Buffer.from(new Uint8Array(raw));
      }
      const parsed = JSON.parse(buf.toString('utf-8')) as HMRServerMessage;
      messages.push(parsed);
      for (const l of listeners) l(parsed);
    } catch {
      // ignore non-JSON
    }
  });

  await new Promise<void>((resolve, reject) => {
    const onOpen = () => {
      ws.off('error', onError);
      resolve();
    };
    const onError = (err: Error) => {
      ws.off('open', onOpen);
      reject(err);
    };
    ws.once('open', onOpen);
    ws.once('error', onError);
  });

  const sendRaw = (message: HMRClientMessage) => {
    ws.send(JSON.stringify(message));
  };

  // Handshake
  sendRaw({ type: 'hmr:connected', platform, bundleEntry });

  const sendLog: FakeClient['sendLog'] = (level, ...data) => {
    sendRaw({ type: 'hmr:log', level, data });
  };

  const invalidate: FakeClient['invalidate'] = (moduleId) => {
    sendRaw({ type: 'hmr:invalidate', moduleId });
  };

  const registerModules: FakeClient['registerModules'] = (modules) => {
    sendRaw({ type: 'hmr:module-registered', modules });
  };

  const waitForMessage: FakeClient['waitForMessage'] = (type, predicate, timeoutMs = 30_000) => {
    const existing = messages.find(
      (m) => m.type === type && (predicate ? predicate(m as any) : true),
    );
    if (existing) return Promise.resolve(existing as any);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        listeners.delete(onMessage);
        reject(
          new Error(
            `Timed out after ${timeoutMs}ms waiting for HMR message "${type}". ` +
              `Received: ${messages.map((m) => m.type).join(', ') || '(none)'}`,
          ),
        );
      }, timeoutMs);

      const onMessage = (message: HMRServerMessage) => {
        if (message.type !== type) return;
        if (predicate && !predicate(message as any)) return;
        clearTimeout(timer);
        listeners.delete(onMessage);
        resolve(message as any);
      };

      listeners.add(onMessage);
    });
  };

  const close = async () => {
    if (ws.readyState === WebSocket.CLOSED) return;
    await new Promise<void>((resolve) => {
      ws.once('close', () => resolve());
      ws.close();
    });
  };

  return {
    ws,
    messages,
    sendLog,
    sendRaw,
    invalidate,
    registerModules,
    waitForMessage,
    close,
  };
}

/* -------------------------------------------------------------------------- */
/* FS mutation helper                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Overwrite a file in the fixture. The rolldown watcher picks it up and
 * triggers the HMR update pipeline.
 */
export function writeFixtureFile(fixtureDir: string, relPath: string, content: string): void {
  fs.writeFileSync(path.join(fixtureDir, relPath), content);
}

export function readFixtureFile(fixtureDir: string, relPath: string): string {
  return fs.readFileSync(path.join(fixtureDir, relPath), 'utf-8');
}
