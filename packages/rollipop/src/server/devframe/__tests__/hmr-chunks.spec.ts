import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { DevframeNodeContext, DevframeScopedNodeRpc } from 'devframe';
import { SourceMapGenerator } from 'source-map';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import { EventBus } from '../../../events/event-bus';
import { getHotUpdatePath, HotUpdateStore } from '../../hot-update-store';
import type { DevServerContext } from '../../types';
import { createAgentToolContext } from '../agent/context';
import { RollipopDevframeController, type DashboardEventsState } from '../index';

describe('dashboard HMR chunks', () => {
  let projectRoot: string;
  let store: HotUpdateStore;
  let context: DevServerContext;
  let controller: RollipopDevframeController;
  const getBundler = vi.fn();
  const bundlerId = 'ios-dev';
  const serverBaseUrl = 'http://localhost:8081';

  beforeEach(() => {
    getBundler.mockClear();
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rollipop-dashboard-hot-'));
    store = new HotUpdateStore(projectRoot);
    context = {
      eventBus: new EventBus(),
      serverBaseUrl,
      bundlerPool: { hotUpdateStore: store, get: getBundler },
    } as unknown as DevServerContext;
    controller = new RollipopDevframeController(context, createAgentToolContext(context));
  });

  afterEach(() => {
    controller.dispose();
    fs.rmSync(projectRoot, { recursive: true, force: true });
  });

  it('exposes encoded absolute chunk URLs and nullable source maps without creating a bundler', () => {
    expect(controller.getHmrChunks(bundlerId)).toEqual([]);
    store.write(bundlerId, {
      filename: 'patch 1.js',
      code: 'first();',
      sourcemap: '{}',
      sourcemapFilename: 'custom 1.map',
    });
    store.write(bundlerId, { filename: 'patch 2.js', code: 'second();' });
    fs.utimesSync(path.join(projectRoot, '.rollipop/hot', bundlerId, 'patch 1.js'), 1000, 1000);
    fs.utimesSync(path.join(projectRoot, '.rollipop/hot', bundlerId, 'patch 2.js'), 2000, 2000);

    expect(controller.getHmrChunks(bundlerId)).toEqual([
      {
        filename: 'patch 2.js',
        bundleUrl: `${serverBaseUrl}/hot/ios-dev/patch%202.js`,
        sourceMapUrl: null,
        updatedAt: 2_000_000,
      },
      {
        filename: 'patch 1.js',
        bundleUrl: `${serverBaseUrl}/hot/ios-dev/patch%201.js`,
        sourceMapUrl: `${serverBaseUrl}/hot/ios-dev/custom%201.map`,
        updatedAt: 1_000_000,
      },
    ]);
    expect(controller.getHmrChunks('unknown')).toEqual([]);
    expect(getBundler).not.toHaveBeenCalled();
  });

  it('symbolicates the selected HMR chunk using its own custom source map', async () => {
    for (const [filename, source, line] of [
      ['first.js', 'Other.tsx', 3],
      ['patch 2.js', 'App.tsx', 7],
    ] as const) {
      const map = new SourceMapGenerator({ file: filename });
      map.addMapping({ generated: { line: 1, column: 2 }, original: { line, column: 0 }, source });
      map.setSourceContent(source, '\n'.repeat(line - 1) + 'throw new Error("boom");');
      store.write(bundlerId, {
        filename,
        code: '  throw new Error("boom");',
        sourcemap: map.toString(),
        sourcemapFilename: `${source}.map`,
      });
    }

    const result = await controller.symbolicateBundlePosition(
      `${serverBaseUrl}${getHotUpdatePath(bundlerId, 'patch 2.js')}`,
      0,
      0,
    );

    expect(result.stack[0]).toMatchObject({ file: 'App.tsx', lineNumber: 7, column: 0 });
    expect(result.codeFrame).toMatchObject({
      fileName: 'App.tsx',
      location: { row: 7, column: 0 },
    });
    expect(getBundler).not.toHaveBeenCalled();
  });

  it('returns generated code when a stored chunk has no source map', async () => {
    const file = `${serverBaseUrl}${getHotUpdatePath(bundlerId, 'patch.js')}`;
    store.write(bundlerId, { filename: 'patch.js', code: 'applyPatch();' });

    const result = await controller.symbolicateBundlePosition(file, 0, 0);

    expect(result.stack[0]).toMatchObject({ file, lineNumber: 1, column: 0 });
    expect(result.codeFrame).toMatchObject({
      fileName: '/hot/ios-dev/patch.js',
      location: { row: 1, column: 0 },
    });
    expect(getBundler).not.toHaveBeenCalled();
  });

  it('reports missing or malformed HMR URLs without creating a bundler', async () => {
    await expect(
      controller.symbolicateBundlePosition(
        `${serverBaseUrl}/hot/ios-dev/missing.js?platform=ios&dev=true`,
        0,
        0,
      ),
    ).rejects.toThrow('HMR chunk not found: ios-dev/missing.js');
    await expect(
      controller.symbolicateBundlePosition(
        `${serverBaseUrl}/hot/ios-dev/nested/patch.js?platform=ios&dev=true`,
        0,
        0,
      ),
    ).rejects.toThrow('Invalid HMR chunk URL');
    expect(getBundler).not.toHaveBeenCalled();
  });

  it('registers the query and publishes a lightweight update after chunks are saved', async () => {
    const register = vi.fn<DevframeScopedNodeRpc['register']>();
    const state: DashboardEventsState = { lastEvent: null };
    await controller.definition.setup({
      scope: () => ({
        rpc: {
          register,
          sharedState: async () => ({
            mutate: (update: (current: DashboardEventsState) => void) => update(state),
          }),
        },
      }),
      agent: { registerTool: vi.fn() },
    } as unknown as DevframeNodeContext);
    const query = register.mock.calls.find(
      ([definition]) => definition.name === 'get-hmr-chunks',
    )?.[0];
    expect(query?.type).toBe('query');
    expect(await query?.handler?.(bundlerId)).toEqual([]);

    const patch = {
      type: 'Patch' as const,
      filename: 'patch.js',
      code: 'applyPatch();',
      changedIds: ['App.tsx'],
      seq: 1,
    };
    store.write(bundlerId, patch);
    context.eventBus.emit({
      type: 'hmr_updates',
      bundlerId,
      updates: [{ clientId: '1', update: patch }],
      changedFiles: ['App.tsx'],
    });

    expect(state.lastEvent).toEqual({ sequence: 1, data: { type: 'hmr_updates', bundlerId } });
    expect(await query?.handler?.(bundlerId)).toEqual([
      {
        filename: 'patch.js',
        bundleUrl: `${serverBaseUrl}/hot/ios-dev/patch.js`,
        sourceMapUrl: null,
        updatedAt: expect.any(Number),
      },
    ]);
    expect(getBundler).not.toHaveBeenCalled();
  });
});
