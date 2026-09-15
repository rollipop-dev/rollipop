import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type * as rolldown from '@rollipop/rolldown';
import { interpreter } from '@rollipop/rolldown/filter';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import { resolutionTopology } from '../resolution-topology-plugin';

type ResolveIdHook = {
  order?: 'pre' | 'post' | null;
  filter?: unknown;
  handler: (
    this: rolldown.PluginContext,
    source: string,
    importer: string | undefined,
    options: { kind: string; isEntry: boolean },
  ) => unknown;
};

type HotUpdateHook = (
  this: rolldown.PluginContext,
  options: { type: 'create' | 'update' | 'delete'; file: string; modules: string[] },
) => unknown;

type WatchChangeHook = (
  this: rolldown.PluginContext,
  id: string,
  change: { event: 'create' | 'update' | 'delete' },
) => unknown;

const resolveOptions = {
  extensions: ['.ts', '.tsx', '.js'],
  mainFiles: ['index'],
};

describe('resolutionTopology', () => {
  let root: string;
  let importer: string;
  let featureDirectory: string;
  let indexJs: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'rollipop-resolution-topology-'));
    importer = path.join(root, 'App.tsx');
    featureDirectory = path.join(root, 'feature');
    indexJs = path.join(featureDirectory, 'index.js');
    fs.mkdirSync(featureDirectory);
    fs.writeFileSync(importer, "import { value } from './feature';\n");
    fs.writeFileSync(indexJs, "export const value = 'js';\n");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('tracks project-local relative extensionless imports and watches their directory', () => {
    const plugin = createPlugin(root);
    const context = createContext([importer]);
    const resolveId = getResolveId(plugin);

    callBuildStart(plugin, context);

    expect(resolveId.order).toBe('post');
    expect(
      interpreter(resolveId.filter as never, undefined, './feature', undefined, importer),
    ).toBe(true);
    expect(callResolveId(resolveId, context, './feature', importer)).toBeNull();
    expect(context.addWatchFile).toHaveBeenCalledWith(root);
    expect(context.addWatchFile).toHaveBeenCalledWith(featureDirectory);

    const secondImporter = path.join(root, 'Second.tsx');
    fs.writeFileSync(secondImporter, "import { value } from './feature';\n");
    expect(callResolveId(resolveId, context, './feature', secondImporter)).toBeNull();

    expect(callResolveId(resolveId, context, 'react', importer)).toBeNull();
    expect(callResolveId(resolveId, context, './feature/index.js', importer)).toBeNull();
    expect(
      callResolveId(resolveId, context, './feature', path.join(root, '..', 'App.tsx')),
    ).toBeNull();
    expect(
      callResolveId(
        resolveId,
        context,
        './feature',
        path.join(root, 'node_modules', 'package', 'index.js'),
      ),
    ).toBeNull();
    expect(context.addWatchFile).toHaveBeenCalledTimes(2);
  });

  it('tracks importers canonicalized through a symlinked project root', () => {
    const linkedRoot = `${root}-link`;
    const canonicalRoot = fs.realpathSync(root);
    const canonicalImporter = fs.realpathSync(importer);
    const canonicalFeatureDirectory = fs.realpathSync(featureDirectory);
    fs.symlinkSync(root, linkedRoot, 'dir');

    try {
      const plugin = createPlugin(linkedRoot);
      const context = createContext([canonicalImporter]);
      const resolveId = getResolveId(plugin);

      callBuildStart(plugin, context);

      expect(
        interpreter(
          resolveId.filter as never,
          undefined,
          './feature',
          undefined,
          canonicalImporter,
        ),
      ).toBe(true);
      expect(callResolveId(resolveId, context, './feature', canonicalImporter)).toBeNull();
      expect(context.addWatchFile).toHaveBeenCalledWith(canonicalRoot);
      expect(context.addWatchFile).toHaveBeenCalledWith(canonicalFeatureDirectory);
    } finally {
      fs.unlinkSync(linkedRoot);
    }
  });

  it('suppresses pre-existing create events replayed when the watcher starts', () => {
    const plugin = createPlugin(root);
    const context = createContext([importer, indexJs]);
    const resolveId = getResolveId(plugin);
    const createdAt = Math.max(
      fs.statSync(indexJs).birthtimeMs,
      fs.statSync(indexJs).ctimeMs,
      fs.statSync(indexJs).mtimeMs,
    );
    vi.spyOn(Date, 'now').mockReturnValue(Math.ceil(createdAt) + 1);

    callBuildStart(plugin, context);
    callResolveId(resolveId, context, './feature', importer);

    callWatchChange(plugin, context, 'create', importer);
    expect(callHotUpdate(plugin, context, 'create', importer, [importer])).toEqual([]);
    expect(callHotUpdate(plugin, context, 'create', indexJs, [indexJs])).toEqual([]);
  });

  it('passes ordinary file updates through to the default HMR path', () => {
    const plugin = createPlugin(root);
    const context = createContext([importer, indexJs]);
    const resolveId = getResolveId(plugin);

    callBuildStart(plugin, context);
    callResolveId(resolveId, context, './feature', importer);

    expect(callHotUpdate(plugin, context, 'update', indexJs, [indexJs])).toBeUndefined();
    expect(callResolveId(resolveId, context, './feature', importer)).toBeNull();
  });

  it.each([
    {
      name: 'a higher-priority index candidate is created',
      mutate() {
        const indexTs = path.join(featureDirectory, 'index.ts');
        fs.writeFileSync(indexTs, "export const value = 'ts';\n");
        return { event: 'create' as const, file: indexTs, winner: indexTs };
      },
    },
    {
      name: 'a higher-priority sibling candidate is created',
      mutate() {
        const featureTs = path.join(root, 'feature.ts');
        fs.writeFileSync(featureTs, "export const value = 'ts';\n");
        return { event: 'create' as const, file: featureTs, winner: featureTs };
      },
    },
    {
      name: 'the selected candidate is deleted',
      prepare() {
        fs.writeFileSync(path.join(featureDirectory, 'index.ts'), "export const value = 'ts';\n");
      },
      mutate() {
        const indexTs = path.join(featureDirectory, 'index.ts');
        fs.unlinkSync(indexTs);
        return { event: 'delete' as const, file: indexTs, winner: indexJs };
      },
    },
    {
      name: 'a native rename removal arrives as an update',
      mutate() {
        const indexTs = path.join(featureDirectory, 'index.ts');
        fs.renameSync(indexJs, indexTs);
        return { event: 'update' as const, file: indexJs, winner: indexTs };
      },
    },
  ])('re-resolves when $name', (testCase) => {
    testCase.prepare?.();
    const plugin = createPlugin(root);
    const graphModules = new Set([importer, indexJs]);
    const preparedIndexTs = path.join(featureDirectory, 'index.ts');
    if (fs.existsSync(preparedIndexTs)) {
      graphModules.add(preparedIndexTs);
    }
    const context = createContext(graphModules);
    const resolveId = getResolveId(plugin);

    callBuildStart(plugin, context);
    callResolveId(resolveId, context, './feature', importer);
    const { event, file, winner } = testCase.mutate();
    const currentModules = event === 'create' ? [] : [file];

    expect(callHotUpdate(plugin, context, event, file, currentModules)).toEqual(
      event === 'delete' ? [file, importer] : [importer],
    );
    expect(callResolveId(resolveId, context, './feature', importer)).toEqual({
      id: fs.realpathSync(winner),
    });
  });

  it('preserves modules already selected for the changed file', () => {
    const otherModule = path.join(root, 'Other.tsx');
    const indexTs = path.join(featureDirectory, 'index.ts');
    fs.writeFileSync(otherModule, 'export {};\n');
    const plugin = createPlugin(root);
    const context = createContext([importer, indexJs, otherModule]);
    const resolveId = getResolveId(plugin);

    callBuildStart(plugin, context);
    callResolveId(resolveId, context, './feature', importer);
    fs.writeFileSync(indexTs, "export const value = 'ts';\n");

    expect(callHotUpdate(plugin, context, 'create', indexTs, [otherModule])).toEqual([
      otherModule,
      importer,
    ]);
  });

  it('replaces a missing update module with all of its graph importers', () => {
    const directImporter = path.join(root, 'Direct.tsx');
    const indexTs = path.join(featureDirectory, 'index.ts');
    fs.writeFileSync(directImporter, "import './feature/index.js';\n");
    const plugin = createPlugin(root);
    const context = createContext(
      [importer, directImporter, indexJs],
      new Map([[indexJs, [importer, directImporter]]]),
    );
    const resolveId = getResolveId(plugin);

    callBuildStart(plugin, context);
    callResolveId(resolveId, context, './feature', importer);
    fs.renameSync(indexJs, indexTs);

    expect(callHotUpdate(plugin, context, 'update', indexJs, [indexJs])).toEqual([
      importer,
      directImporter,
    ]);
  });

  it('re-resolves a moved candidate reported as an update outside the graph', () => {
    const featureTs = path.join(root, 'feature.ts');
    const plugin = createPlugin(root);
    const context = createContext([importer, indexJs]);
    const resolveId = getResolveId(plugin);

    callBuildStart(plugin, context);
    callResolveId(resolveId, context, './feature', importer);
    fs.writeFileSync(featureTs, "export const value = 'ts';\n");
    callWatchChange(plugin, context, 'update', featureTs);

    expect(callHotUpdate(plugin, context, 'update', featureTs, [])).toEqual([importer]);
    expect(callResolveId(resolveId, context, './feature', importer)).toEqual({
      id: fs.realpathSync(featureTs),
    });
  });

  it('surfaces a resolve error after deletion and recovers when a candidate is created', () => {
    const indexTs = path.join(featureDirectory, 'index.ts');
    const plugin = createPlugin(root);
    const context = createContext([importer, indexJs]);
    const resolveId = getResolveId(plugin);

    callBuildStart(plugin, context);
    callResolveId(resolveId, context, './feature', importer);
    fs.unlinkSync(indexJs);
    callWatchChange(plugin, context, 'delete', indexJs);
    expect(callHotUpdate(plugin, context, 'delete', indexJs, [indexJs])).toEqual([
      indexJs,
      importer,
    ]);
    expect(() => callResolveId(resolveId, context, './feature', importer)).toThrow(/feature/);

    fs.writeFileSync(indexTs, "export const value = 'ts';\n");
    callWatchChange(plugin, context, 'create', indexTs);
    expect(callHotUpdate(plugin, context, 'create', indexTs, [])).toEqual([importer]);
    expect(callResolveId(resolveId, context, './feature', importer)).toEqual({
      id: fs.realpathSync(indexTs),
    });
  });

  it('revalidates a topology override when its importer changes', () => {
    const indexTs = path.join(featureDirectory, 'index.ts');
    const plugin = createPlugin(root);
    const context = createContext([importer, indexJs]);
    const resolveId = getResolveId(plugin);

    callBuildStart(plugin, context);
    callResolveId(resolveId, context, './feature', importer);
    fs.writeFileSync(indexTs, "export const value = 'ts';\n");
    callWatchChange(plugin, context, 'create', indexTs);
    expect(callHotUpdate(plugin, context, 'create', indexTs, [])).toEqual([importer]);
    expect(callResolveId(resolveId, context, './feature', importer)).toEqual({
      id: fs.realpathSync(indexTs),
    });

    callWatchChange(plugin, context, 'update', importer);
    expect(callResolveId(resolveId, context, './feature', importer)).toEqual({
      id: fs.realpathSync(indexTs),
    });
  });

  it('re-resolves edges when a watched directory receives a metadata update', () => {
    const indexTs = path.join(featureDirectory, 'index.ts');
    const plugin = createPlugin(root);
    const context = createContext([importer, indexJs]);
    const resolveId = getResolveId(plugin);

    callBuildStart(plugin, context);
    callResolveId(resolveId, context, './feature', importer);
    fs.writeFileSync(indexTs, "export const value = 'ts';\n");
    callWatchChange(plugin, context, 'update', featureDirectory);

    expect(callHotUpdate(plugin, context, 'update', featureDirectory, [])).toEqual([importer]);
    expect(callResolveId(resolveId, context, './feature', importer)).toEqual({
      id: fs.realpathSync(indexTs),
    });
  });

  it('tracks exact main file names independently of configured extensions', () => {
    const plugin = createPlugin(root, { extensions: ['.ts'], mainFiles: ['index.js'] });
    const context = createContext([importer, indexJs]);
    const resolveId = getResolveId(plugin);

    callBuildStart(plugin, context);
    callResolveId(resolveId, context, './feature', importer);
    fs.unlinkSync(indexJs);
    callWatchChange(plugin, context, 'delete', indexJs);

    expect(callHotUpdate(plugin, context, 'delete', indexJs, [indexJs])).toEqual([
      indexJs,
      importer,
    ]);
    expect(() => callResolveId(resolveId, context, './feature', importer)).toThrow(/feature/);
  });

  it('ignores unrelated files in a watched parent directory', () => {
    const unrelatedFile = path.join(root, 'Other.tsx');
    const plugin = createPlugin(root);
    const context = createContext([importer, indexJs]);
    const resolveId = getResolveId(plugin);

    callBuildStart(plugin, context);
    callResolveId(resolveId, context, './feature', importer);
    fs.writeFileSync(unrelatedFile, 'export {};\n');

    expect(callHotUpdate(plugin, context, 'create', unrelatedFile, [])).toBeUndefined();
  });

  it('forgets stale resolution edges when an importer changes', () => {
    const indexTs = path.join(featureDirectory, 'index.ts');
    const plugin = createPlugin(root);
    const context = createContext([importer, indexJs]);
    const resolveId = getResolveId(plugin);

    callBuildStart(plugin, context);
    callResolveId(resolveId, context, './feature', importer);
    callWatchChange(plugin, context, 'update', importer);
    fs.writeFileSync(indexTs, "export const value = 'ts';\n");

    expect(callHotUpdate(plugin, context, 'create', indexTs, [])).toBeUndefined();
  });

  it('drops topology state for importers that left the module graph', () => {
    const plugin = createPlugin(root);
    const graphModules = new Set([importer, indexJs]);
    const context = createContext(graphModules);
    const resolveId = getResolveId(plugin);

    callBuildStart(plugin, context);
    callResolveId(resolveId, context, './feature', importer);
    graphModules.delete(importer);

    expect(callHotUpdate(plugin, context, 'delete', indexJs, [indexJs])).toBeUndefined();
    graphModules.add(importer);
    expect(callResolveId(resolveId, context, './feature', importer)).toBeNull();
  });
});

function createPlugin(root: string, resolve = resolveOptions) {
  const plugin = resolutionTopology({ root, resolve });
  expect(plugin).not.toBeNull();
  return plugin!;
}

function createContext(
  moduleIds: Iterable<string>,
  importersByModule: ReadonlyMap<string, string[]> = new Map(),
) {
  const modules = moduleIds instanceof Set ? moduleIds : new Set(moduleIds);
  return {
    addWatchFile: vi.fn(),
    error: vi.fn((error: string | Error) => {
      throw typeof error === 'string' ? new Error(error) : error;
    }),
    getModuleInfo: vi.fn((id: string) =>
      modules.has(id) ? { id, importers: importersByModule.get(id) ?? [] } : null,
    ),
  } as unknown as rolldown.PluginContext & { addWatchFile: ReturnType<typeof vi.fn> };
}

function getResolveId(plugin: rolldown.Plugin) {
  return plugin.resolveId as ResolveIdHook;
}

function callBuildStart(plugin: rolldown.Plugin, context: rolldown.PluginContext) {
  expect(typeof plugin.buildStart).toBe('function');
  return (plugin.buildStart as (this: rolldown.PluginContext) => unknown).call(context);
}

function callResolveId(
  hook: ResolveIdHook,
  context: rolldown.PluginContext,
  source: string,
  importer: string,
) {
  return hook.handler.call(context, source, importer, {
    kind: 'import-statement',
    isEntry: false,
  });
}

function callHotUpdate(
  plugin: rolldown.Plugin,
  context: rolldown.PluginContext,
  type: 'create' | 'update' | 'delete',
  file: string,
  modules: string[],
) {
  const hotUpdate = Reflect.get(plugin, 'hotUpdate') as HotUpdateHook;
  return hotUpdate.call(context, { type, file, modules });
}

function callWatchChange(
  plugin: rolldown.Plugin,
  context: rolldown.PluginContext,
  event: 'create' | 'update' | 'delete',
  id: string,
) {
  const watchChange = plugin.watchChange as WatchChangeHook;
  return watchChange.call(context, id, { event });
}
