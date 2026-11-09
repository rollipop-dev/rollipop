import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { build } from '@rollipop/rolldown';
import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';

import { ROLLIPOP_VIRTUAL_BOOTSTRAP_ID, ROLLIPOP_VIRTUAL_ENTRY_ID } from '../../../constants';
import { evaluateContext } from '../../../testing/evaluate-context';
import type { HMRGraphMetadata } from '../../../types/runtime';
import { devServer } from '../dev-server-plugin';
import { entry } from '../entry-plugin';

describe('persistent dev server cache', () => {
  let root: string;
  let appPath: string;

  beforeEach(() => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'rollipop-server-cache-')));
    appPath = path.join(root, 'app.js');
    fs.writeFileSync(appPath, 'globalThis.appLoaded = true;\n');
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  async function bundle(origin: string, bundleEntry = 'index.bundle') {
    const id = 'cached-dev-graph';
    const cacheHits: string[] = [];
    const transformed: string[] = [];
    const result = await build({
      id,
      cwd: root,
      input: ROLLIPOP_VIRTUAL_ENTRY_ID,
      transform: { define: { 'import.meta.hot': '__hot__' } },
      plugins: [
        entry({ id, entryPath: appPath }),
        await devServer({
          cwd: root,
          id,
          origin,
          bundleEntry,
          platform: 'ios',
          hmrClientPath: 'unused',
          hmrConfig: null,
        }),
        {
          name: 'observe-transform-cache',
          transformCacheHit(id) {
            cacheHits.push(id);
          },
          transform(_code, id) {
            transformed.push(id);
          },
        },
      ],
      output: { format: 'iife', persistentCache: true },
      write: false,
    });
    const chunk = result.output[0]!;
    expect(chunk.type).toBe('chunk');
    if (chunk.type !== 'chunk') throw new Error('Expected a bundle chunk');

    const graphs: HMRGraphMetadata[] = [];
    const context = evaluateContext({
      __hot__: { runtime: {} },
      __rollipop_runtime__: {
        registerGraph(graph: HMRGraphMetadata) {
          graphs.push(graph);
        },
      },
    });
    context.evaluate(chunk.code);
    expect(context.evaluate('globalThis.appLoaded')).toBe(true);
    expect(graphs).toHaveLength(1);

    return { graph: graphs[0]!, cacheHits, transformed };
  }

  it('updates the HMR origin after changing ports while reusing other transforms', async () => {
    const first = await bundle('http://localhost:18092');
    expect(first.graph.origin).toBe('http://localhost:18092');

    const changed = await bundle('http://localhost:8081');
    expect(changed.graph.origin).toBe('http://localhost:8081');
    expect(changed.cacheHits).toEqual(
      expect.arrayContaining([ROLLIPOP_VIRTUAL_BOOTSTRAP_ID, appPath]),
    );
    expect(changed.transformed).toHaveLength(1);

    const repeated = await bundle('http://localhost:8081');
    expect(repeated.graph.origin).toBe('http://localhost:8081');
    expect(repeated.transformed).toEqual([]);
  });

  it('updates the bundle entry without discarding other cached transforms', async () => {
    await bundle('http://localhost:8081');

    const changed = await bundle('http://localhost:8081', 'remote.bundle');
    expect(changed.graph.bundleEntry).toBe('remote.bundle');
    expect(changed.cacheHits).toEqual(
      expect.arrayContaining([ROLLIPOP_VIRTUAL_BOOTSTRAP_ID, appPath]),
    );
    expect(changed.transformed).toHaveLength(1);
  });
});
