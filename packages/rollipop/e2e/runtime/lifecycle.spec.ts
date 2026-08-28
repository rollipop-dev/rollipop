import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';

import {
  type DevframeEventSubscription,
  type TestServer,
  cloneFixture,
  createFakeClient,
  startTestServer,
  subscribeDevframeEvents,
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
    const events: DevframeEventSubscription = await subscribeDevframeEvents(ts.baseUrl);
    try {
      const [startedEvent, doneEvent, res] = await Promise.all([
        events.waitFor('bundle_build_started', undefined, 120_000),
        events.waitFor('bundle_build_done', undefined, 120_000),
        fetch(`${ts.baseUrl}/index.bundle?platform=ios&dev=true`),
      ]);

      expect(res.status).toBe(200);
      expect(startedEvent.bundlerId).toBeTruthy();
      expect(doneEvent.bundlerId).toBe(startedEvent.bundlerId);
      expect(doneEvent.totalModules).toBeGreaterThan(0);
      expect(doneEvent.duration).toBeGreaterThanOrEqual(0);
    } finally {
      events.close();
    }
  }, 180_000);

  it('emits client_connected when an HMR client connects, and client_disconnected on close', async () => {
    const events = await subscribeDevframeEvents(ts.baseUrl);
    try {
      const connectedPromise = events.waitFor('client_connected', undefined, 10_000);
      const client = await createFakeClient({
        baseUrl: ts.baseUrl,
        platform: 'ios',
      });
      const connected = await connectedPromise;
      expect(typeof connected.clientId).toBe('number');

      const disconnectedPromise = events.waitFor(
        'client_disconnected',
        (e) => e.clientId === connected.clientId,
        10_000,
      );
      await client.close();
      const disconnected = await disconnectedPromise;
      expect(disconnected.clientId).toBe(connected.clientId);
    } finally {
      events.close();
    }
  }, 30_000);
});
