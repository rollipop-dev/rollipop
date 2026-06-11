import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vite-plus/test';

import {
  type FakeClient,
  type SSESubscription,
  type TestServer,
  cloneFixture,
  createFakeClient,
  readFixtureFile,
  startTestServer,
  subscribeSSE,
  writeFixtureFile,
} from './harness';

const APP_TSX_ORIGINAL = `import React from 'react';
import { Text, View } from 'react-native';

// e2e-marker: initial
export function App() {
  return (
    <View>
      <Text>hmr-e2e-initial</Text>
    </View>
  );
}

if (import.meta.hot) {
  import.meta.hot.accept();
}
`;

// Module IDs the rolldown dev engine uses internally are paths relative to
// the project root, not absolute paths — see the register calls emitted in
// the dev bundle (e.g. `__rolldown_runtime__.registerModule("App.tsx", ...)`).
// If we register absolute paths here the dev engine fails to match and
// returns `Patch` with empty `applyUpdates([])`, so no concrete update or
// reload message is dispatched.
const APP_MODULE_ID = 'App.tsx';
const INDEX_MODULE_ID = 'index.js';

let fixture: { dir: string; cleanup: () => void };
let ts: TestServer;
let sse: SSESubscription;
let client: FakeClient;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function resetObservedEvents() {
  sse.events.length = 0;
  client.messages.length = 0;
}

async function prepareClientForHMR() {
  resetObservedEvents();
  client.registerModules([INDEX_MODULE_ID, APP_MODULE_ID]);
  await sleep(1000);
}

beforeAll(async () => {
  fixture = cloneFixture('hmr-app');
  ts = await startTestServer(fixture.dir);

  sse = await subscribeSSE(ts.baseUrl);

  // Activate the watcher via an HTTP bundle request — the HTTP build and
  // the HMR WS share a bundler instance (see utils/id.ts#createId).
  const bundleRes = await fetch(`${ts.baseUrl}/index.bundle?platform=ios&dev=true`);
  if (bundleRes.status !== 200) {
    throw new Error(`Initial /index.bundle failed: HTTP ${bundleRes.status}`);
  }
  await bundleRes.text();
  await sse.waitFor('bundle_build_done', undefined, 180_000);

  client = await createFakeClient({ baseUrl: ts.baseUrl, platform: 'ios' });

  // Register modules with their rolldown-internal IDs so the dev engine
  // recognises them when files change.
  client.registerModules([INDEX_MODULE_ID, APP_MODULE_ID]);

  // registerModules is fire-and-forget over WS; give the server a moment to
  // call devEngine.registerModules before the first file-change test runs.
  await sleep(1000);
}, 300_000);

afterAll(async () => {
  await client?.close();
  sse?.close();
  await ts?.close();
  fixture?.cleanup();
}, 60_000);

afterEach(async () => {
  if (readFixtureFile(fixture.dir, 'App.tsx') === APP_TSX_ORIGINAL) {
    await sleep(200);
    return;
  }

  writeFixtureFile(fixture.dir, 'App.tsx', APP_TSX_ORIGINAL);
  await sleep(200);
});

describe('runtime e2e: HMR', () => {
  it('dispatches a FullReload (hmr:reload) when an entry module without an accept boundary is invalidated', async () => {
    // NOTE: The rolldown dev-engine watcher in its current state only emits
    // watchChange / onHmrUpdates for files that are themselves HMR accept
    // boundaries — writes to the entry (`index.js`) or non-boundary deps
    // (e.g. `app.json`) never reach the pipeline. Verified empirically with
    // an e2e probe (see the project log).
    //
    // We therefore drive the FullReload path via `hmr:invalidate`, which is
    // the same runtime signal a real client would send when it can't handle
    // an incoming update. rolldown's HMR engine walks importers looking for
    // an accept boundary (hmr_stage.rs#propagate_update) and, finding none
    // above the entry, returns `HmrUpdate::FullReload` — the exact behaviour
    // the user expects for entry-file changes.
    await prepareClientForHMR();

    const reloadPromise = client.waitForMessage('hmr:reload', undefined, 60_000);
    const updateDonePromise = client.waitForMessage('hmr:update-done', undefined, 60_000);

    client.invalidate(INDEX_MODULE_ID);

    await reloadPromise;
    await updateDonePromise;

    const newMessages = client.messages.map((m) => m.type);
    expect(newMessages).toContain('hmr:reload');
    expect(newMessages).not.toContain('hmr:update');
  }, 60_000);

  it('dispatches a Patch (hmr:update) when a module with import.meta.hot.accept changes', async () => {
    await prepareClientForHMR();

    const watchPromise = sse.waitFor('watch_change', (e) => e.file.includes('App.tsx'), 60_000);
    const updateStartPromise = client.waitForMessage('hmr:update-start', undefined, 60_000);
    const updatePromise = client.waitForMessage('hmr:update', undefined, 60_000);
    const updateDonePromise = client.waitForMessage('hmr:update-done', undefined, 60_000);

    writeFixtureFile(
      fixture.dir,
      'App.tsx',
      APP_TSX_ORIGINAL.replace('hmr-e2e-initial', 'hmr-e2e-patched'),
    );

    const watch = await watchPromise;
    expect(watch.bundlerId).toBeTruthy();
    expect(watch.file).toContain('App.tsx');

    await updateStartPromise;
    const update = await updatePromise;
    await updateDonePromise;

    // The Patch body is the rolldown runtime's `applyUpdates(...)` call.
    // A healthy Patch for a registered + accepted module contains non-empty
    // update arguments — not just `applyUpdates([])`, which is what you get
    // when registration misses.
    expect(typeof update.code).toBe('string');
    expect(update.code).toContain('__rolldown_runtime__');
    expect(update.code).toContain('applyUpdates');
    expect(update.code).not.toMatch(/applyUpdates\(\s*\[\s*\]\s*\)/);

    const newMessages = client.messages.map((m) => m.type);
    expect(newMessages).not.toContain('hmr:reload');
  }, 180_000);

  it('reports a build error via SSE bundle_build_failed and WS hmr:error', async () => {
    await prepareClientForHMR();

    const failedPromise = sse.waitFor('bundle_build_failed', undefined, 60_000);
    const errorPromise = client.waitForMessage('hmr:error', undefined, 60_000);

    writeFixtureFile(
      fixture.dir,
      'App.tsx',
      `import React from 'react';
import { Text, View } from 'react-native';

export function App() {
  const broken = ;
  return (
    <View>
      <Text>{broken}</Text>
    </View>
  );
}
`,
    );

    const failed = await failedPromise;
    expect(failed.bundlerId).toBeTruthy();
    expect(typeof failed.error).toBe('string');
    expect(failed.error.length).toBeGreaterThan(0);

    const error = await errorPromise;
    expect(error.payload.type).toBeTruthy();
    expect(error.payload.message).toBeTruthy();
    expect(error.payload.errors.length).toBeGreaterThan(0);
  }, 120_000);
});
