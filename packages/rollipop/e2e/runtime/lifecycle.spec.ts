import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';

import {
  type SSESubscription,
  type TestServer,
  cloneFixture,
  createFakeClient,
  startTestServer,
  subscribeSSE,
} from './harness';

let fixture: { dir: string; cleanup: () => void };
let ts: TestServer;

beforeAll(async () => {
  fixture = cloneFixture('hmr-app');
  ts = await startTestServer(fixture.dir);
}, 60_000);

afterAll(async () => {
  await ts?.close();
  fixture?.cleanup();
}, 60_000);

describe('runtime e2e: lifecycle', () => {
  it('GET /status returns packager-status:running', async () => {
    const res = await fetch(`${ts.baseUrl}/status`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('packager-status:running');
  });

  it('emits bundle_build_started and bundle_build_done when /index.bundle is requested', async () => {
    const sse: SSESubscription = await subscribeSSE(ts.baseUrl);
    try {
      const [startedEvent, doneEvent, res] = await Promise.all([
        sse.waitFor('bundle_build_started', undefined, 120_000),
        sse.waitFor('bundle_build_done', undefined, 120_000),
        fetch(`${ts.baseUrl}/index.bundle?platform=ios&dev=true`),
      ]);

      expect(res.status).toBe(200);
      expect(startedEvent.bundlerId).toBeTruthy();
      expect(doneEvent.bundlerId).toBe(startedEvent.bundlerId);
      expect(doneEvent.totalModules).toBeGreaterThan(0);
      expect(doneEvent.duration).toBeGreaterThanOrEqual(0);
    } finally {
      sse.close();
    }
  }, 180_000);

  it('emits client_connected when an HMR client connects, and client_disconnected on close', async () => {
    const sse = await subscribeSSE(ts.baseUrl);
    try {
      const connectedPromise = sse.waitFor('client_connected', undefined, 10_000);
      const client = await createFakeClient({
        baseUrl: ts.baseUrl,
        platform: 'ios',
      });
      const connected = await connectedPromise;
      expect(typeof connected.clientId).toBe('number');

      const disconnectedPromise = sse.waitFor(
        'client_disconnected',
        (e) => e.clientId === connected.clientId,
        10_000,
      );
      await client.close();
      const disconnected = await disconnectedPromise;
      expect(disconnected.clientId).toBe(connected.clientId);
    } finally {
      sse.close();
    }
  }, 30_000);

  it('forwards hmr:log from the client as a client_log SSE event', async () => {
    const sse = await subscribeSSE(ts.baseUrl, '/sse/client-logs');
    const client = await createFakeClient({
      baseUrl: ts.baseUrl,
      platform: 'ios',
    });
    try {
      const marker = `hello-${Date.now()}`;
      const logPromise = sse.waitFor(
        'client_log',
        (e) =>
          Array.isArray(e.data) && e.data.some((d) => typeof d === 'string' && d.includes(marker)),
        10_000,
      );
      client.sendLog('info', marker, { count: 42 });
      const event = await logPromise;
      expect(event.bundlerId).toBeTruthy();
      expect(event.data).toEqual(expect.arrayContaining([expect.stringContaining(marker)]));
    } finally {
      await client.close();
      sse.close();
    }
  }, 180_000);
});
