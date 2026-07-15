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

// Explicit HMR boundary so rolldown can emit a Patch (hmr:update) for
// edits to this file regardless of React Refresh wrapper heuristics.
if (import.meta.hot) {
  import.meta.hot.accept();
}
`;

const INDEX_JS_ORIGINAL = `import { AppRegistry } from 'react-native';

import { App } from './App';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);
`;

const APP_MODULE_ID = 'App.tsx';
const INDEX_MODULE_ID = 'index.js';

let fixture: { dir: string; cleanup: () => void };
let ts: TestServer;
let sse: SSESubscription;
let client: FakeClient;
let lastPatchSeq = 0;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function resetObservedEvents() {
  sse.events.length = 0;
  client.messages.length = 0;
}

function prepareClientForHMR() {
  resetObservedEvents();
}

function acknowledgePatch(filename: string, seq: number) {
  lastPatchSeq = Math.max(lastPatchSeq, seq);
  client.sendRaw({ type: 'hmr:payload-delivered', filename });
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

  // The handshake registers this fake client's stable ID with the dev engine.
  // Give the asynchronous registration time to finish before changing files.
  await sleep(1000);
}, 300_000);

afterAll(async () => {
  await client?.close();
  sse?.close();
  await ts?.close();
  fixture?.cleanup();
}, 60_000);

afterEach(async () => {
  await sleep(200);

  if (readFixtureFile(fixture.dir, 'App.tsx') !== APP_TSX_ORIGINAL) {
    const restorePatchPromise = client.waitForMessage(
      'hmr:update',
      (message) => message.seq > lastPatchSeq,
      60_000,
    );
    writeFixtureFile(fixture.dir, 'App.tsx', APP_TSX_ORIGINAL);
    const update = await restorePatchPromise;
    acknowledgePatch(update.filename, update.seq);
  }

  if (readFixtureFile(fixture.dir, 'index.js') !== INDEX_JS_ORIGINAL) {
    const restorePatchPromise = client.waitForMessage(
      'hmr:update',
      (message) => message.seq > lastPatchSeq,
      60_000,
    );
    writeFixtureFile(fixture.dir, 'index.js', INDEX_JS_ORIGINAL);
    const update = await restorePatchPromise;
    acknowledgePatch(update.filename, update.seq);
  }

  await sleep(200);
});

describe('runtime e2e: HMR', () => {
  it('dispatches a Patch (hmr:update) that invalidates non-component refresh boundaries', async () => {
    prepareClientForHMR();

    const watchPromise = sse.waitFor('watch_change', (e) => e.file.includes('index.js'), 60_000);
    const updateStartPromise = client.waitForMessage('hmr:update-start', undefined, 60_000);
    const updatePromise = client.waitForMessage(
      'hmr:update',
      (message) => message.code.includes('invalidate'),
      60_000,
    );
    const updateDonePromise = client.waitForMessage('hmr:update-done', undefined, 60_000);

    writeFixtureFile(
      fixture.dir,
      'index.js',
      `${INDEX_JS_ORIGINAL}\n// e2e-marker: index-refresh-invalidate\n`,
    );

    const watch = await watchPromise;
    expect(watch.bundlerId).toBeTruthy();
    expect(watch.file).toContain('index.js');

    await updateStartPromise;
    const update = await updatePromise;
    acknowledgePatch(update.filename, update.seq);
    await updateDonePromise;

    expect(update.filename).toMatch(/^hmr_patch_\d+\.js$/);
    expect(update.sourceURL).toBe(`/hot/${watch.bundlerId}/${update.filename}`);
    expect(update.changedIds).toContain(INDEX_MODULE_ID);
    expect(update.seq).toBeGreaterThan(0);
    expect(update.code).toContain('registerGraph');
    expect(update.code).toContain('registerFactory');
    expect(update.code).toContain('invalidate');

    const newMessages = client.messages.map((m) => m.type);
    expect(newMessages).toContain('hmr:update');
    expect(newMessages).not.toContain('hmr:reload');
  }, 60_000);

  it('dispatches a Patch (hmr:update) when a module with import.meta.hot.accept changes', async () => {
    prepareClientForHMR();

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
    acknowledgePatch(update.filename, update.seq);
    await updateDonePromise;

    expect(update.filename).toMatch(/^hmr_patch_\d+\.js$/);
    expect(update.sourceURL).toBe(`/hot/${watch.bundlerId}/${update.filename}`);
    expect(update.changedIds).toContain(APP_MODULE_ID);
    expect(update.seq).toBeGreaterThan(0);
    expect(typeof update.code).toBe('string');
    expect(update.code).toContain('__rolldown_runtime__');
    expect(update.code).toContain('registerGraph');
    expect(update.code).toContain('registerFactory');

    const newMessages = client.messages.map((m) => m.type);
    expect(newMessages).not.toContain('hmr:reload');
  }, 180_000);

  it('reports an HMR error via SSE hmr_failed and WS hmr:error', async () => {
    prepareClientForHMR();

    const failedPromise = sse.waitFor('hmr_failed', undefined, 60_000);
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
