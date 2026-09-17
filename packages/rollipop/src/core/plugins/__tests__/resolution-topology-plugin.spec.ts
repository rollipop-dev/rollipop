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

  it('does not stat missing extension candidates for every importer during the initial build', () => {
    fs.rmSync(featureDirectory, { recursive: true });
    const featureTs = path.join(root, 'feature.ts');
    const secondImporter = path.join(root, 'Second.tsx');
    fs.writeFileSync(featureTs, 'export const value = 1;\n');
    fs.writeFileSync(secondImporter, "import './feature';\n");
    const plugin = createPlugin(root, {
      ...resolveOptions,
      extensions: ['.ts', ...Array.from({ length: 120 }, (_, index) => `.ext${index}`)],
    });
    const context = createContext([importer, secondImporter, featureTs]);
    const stat = vi.spyOn(fs, 'statSync');
    const readdir = vi.spyOn(fs, 'readdirSync');

    callBuildStart(plugin, context);
    callResolveId(getResolveId(plugin), context, './feature', importer);
    callResolveId(getResolveId(plugin), context, './feature', secondImporter);

    expect(stat.mock.calls.length).toBeLessThan(10);
    expect(readdir.mock.calls).toEqual([[root]]);
    expect(callHotUpdate(plugin, context, 'create', featureTs, [featureTs])).toEqual([]);
  });

  it('keeps snapshots of existing candidates with lower extension priority', () => {
    const indexTs = path.join(featureDirectory, 'index.ts');
    fs.writeFileSync(indexTs, 'export const value = 1;\n');
    const plugin = createPlugin(root);
    const context = createContext([importer, indexTs]);

    callBuildStart(plugin, context);
    callResolveId(getResolveId(plugin), context, './feature', importer);

    expect(callHotUpdate(plugin, context, 'create', indexTs, [indexTs])).toEqual([]);
    expect(callHotUpdate(plugin, context, 'create', indexJs, [])).toEqual([]);
  });

  it('does not reuse initial directory listings for edges discovered after buildEnd', async () => {
    const plugin = createPlugin(root);
    const context = createContext([importer, indexJs]);
    callBuildStart(plugin, context);
    callResolveId(getResolveId(plugin), context, './feature', importer);
    await callBuildEnd(plugin, context);
    const added = path.join(root, 'added.ts');
    fs.writeFileSync(added, 'export const value = 1;\n');

    callResolveId(getResolveId(plugin), context, './added', importer);

    expect(callHotUpdate(plugin, context, 'create', added, [])).toEqual([]);
  });

  it('refreshes directory listings at the next full build', async () => {
    const plugin = createPlugin(root);
    const context = createContext([importer, indexJs]);
    callBuildStart(plugin, context);
    callResolveId(getResolveId(plugin), context, './feature', importer);
    await callBuildEnd(plugin, context);
    const featureTs = path.join(root, 'feature.ts');
    fs.writeFileSync(featureTs, 'export const value = 1;\n');

    callBuildStart(plugin, context);
    callResolveId(getResolveId(plugin), context, './feature', importer);

    expect(callHotUpdate(plugin, context, 'create', featureTs, [])).toEqual([]);
  });

  it('falls back to stat when a directory cannot be listed', () => {
    const plugin = createPlugin(root);
    const context = createContext([importer, indexJs]);
    vi.spyOn(fs, 'readdirSync').mockImplementation(() => {
      throw Object.assign(new Error('Cannot list directory'), { code: 'EACCES' });
    });

    callBuildStart(plugin, context);
    callResolveId(getResolveId(plugin), context, './feature', importer);

    expect(callHotUpdate(plugin, context, 'create', indexJs, [indexJs])).toEqual([]);
  });

  it('preserves filesystem case and unicode normalization when filtering candidate names', () => {
    const indexTs = path.join(featureDirectory, 'index.ts');
    const unicodeFile = path.join(root, 'caf\u00e9.ts');
    fs.writeFileSync(indexTs, 'export const value = 1;\n');
    fs.writeFileSync(unicodeFile, 'export const value = 2;\n');
    const plugin = createPlugin(root);
    const context = createContext([importer, indexJs, indexTs]);
    const readdir = fs.readdirSync;
    vi.spyOn(fs, 'readdirSync').mockImplementation(((directory: fs.PathLike) =>
      (readdir(directory) as string[]).map((name) =>
        name.toUpperCase().normalize('NFD'),
      )) as typeof fs.readdirSync);

    callBuildStart(plugin, context);
    callResolveId(getResolveId(plugin), context, './feature', importer);
    callResolveId(getResolveId(plugin), context, './caf\u00e9', importer);

    expect(callHotUpdate(plugin, context, 'create', indexTs, [indexTs])).toEqual([]);
    expect(callHotUpdate(plugin, context, 'create', unicodeFile, [])).toEqual([]);
  });

  it.each([
    { requested: '\u03c2', listed: '\u03c3' },
    { requested: 'stra\u00dfe', listed: 'strasse' },
    { requested: 'strasse', listed: 'stra\u00dfe' },
    { requested: 'sample', listed: '\u017fample' },
  ])(
    'does not reject filesystem-equivalent names ($requested / $listed)',
    ({ requested, listed }) => {
      const file = path.join(root, `${requested}.ts`);
      fs.writeFileSync(file, 'export const value = 1;\n');
      const plugin = createPlugin(root);
      const context = createContext([importer, file]);
      const readdir = fs.readdirSync;
      // Model a filesystem listing a different equivalent spelling while stat
      // accepts the requested name. This is deterministic on case-sensitive hosts too.
      vi.spyOn(fs, 'readdirSync').mockImplementation(((directory: fs.PathLike) =>
        (readdir(directory) as string[]).map((name) =>
          name === `${requested}.ts` ? `${listed}.ts` : name,
        )) as typeof fs.readdirSync);

      callBuildStart(plugin, context);
      callResolveId(getResolveId(plugin), context, `./${requested}`, importer);

      expect(callHotUpdate(plugin, context, 'create', file, [file])).toEqual([]);
    },
  );

  it('snapshots nested main file candidates and symlinked files', () => {
    const nestedDirectory = path.join(featureDirectory, 'nested');
    const nestedIndex = path.join(nestedDirectory, 'entry.ts');
    fs.mkdirSync(nestedDirectory);
    fs.symlinkSync(indexJs, nestedIndex);
    const plugin = createPlugin(root, { ...resolveOptions, mainFiles: ['nested/entry'] });
    const context = createContext([importer]);
    const stat = vi.spyOn(fs, 'statSync');

    callBuildStart(plugin, context);
    callResolveId(getResolveId(plugin), context, './feature', importer);

    expect(stat).toHaveBeenCalledWith(nestedIndex, { bigint: true, throwIfNoEntry: false });
  });

  it('keeps platform and development extension precedence after discarding the startup cache', async () => {
    const base = path.join(root, 'feature.ts');
    const preferred = path.join(root, 'feature.dev.ios.ts');
    fs.writeFileSync(base, 'export const value = 1;\n');
    const plugin = createPlugin(root, {
      ...resolveOptions,
      extensions: ['.dev.ios.ts', '.ios.ts', '.native.ts', '.ts', '.js'],
    });
    const context = createContext([importer, base]);
    callBuildStart(plugin, context);
    callResolveId(getResolveId(plugin), context, './feature', importer);
    await callBuildEnd(plugin, context);
    fs.writeFileSync(preferred, 'export const value = 2;\n');

    callWatchChange(plugin, context, 'create', preferred);
    expect(callHotUpdate(plugin, context, 'create', preferred, [])).toEqual([importer]);
    expect(callResolveId(getResolveId(plugin), context, './feature', importer)).toEqual({
      id: fs.realpathSync(preferred),
    });
  });

  it('does not suppress a new candidate created after the initial directory listing', () => {
    const plugin = createPlugin(root);
    const context = createContext([importer, indexJs]);
    callBuildStart(plugin, context);
    callResolveId(getResolveId(plugin), context, './feature', importer);
    const added = path.join(root, 'added.ts');
    fs.writeFileSync(added, 'export const value = 2;\n');
    callResolveId(getResolveId(plugin), context, './added', importer);

    callWatchChange(plugin, context, 'create', added);
    expect(callHotUpdate(plugin, context, 'create', added, [])).toEqual([importer]);
    expect(callResolveId(getResolveId(plugin), context, './added', importer)).toEqual({
      id: fs.realpathSync(added),
    });
  });

  it('retains all importers and query suffixes when snapshots are deduplicated by target', () => {
    const second = path.join(root, 'Second.tsx');
    fs.writeFileSync(second, "import './feature';\n");
    const plugin = createPlugin(root);
    const context = createContext([importer, second, indexJs]);
    callBuildStart(plugin, context);
    callResolveId(getResolveId(plugin), context, './feature?one', importer);
    callResolveId(getResolveId(plugin), context, './feature#two', second);
    const preferred = path.join(root, 'feature.ts');
    fs.writeFileSync(preferred, 'export const value = 2;\n');

    callWatchChange(plugin, context, 'create', preferred);
    expect(callHotUpdate(plugin, context, 'create', preferred, [])).toEqual([importer, second]);
    expect(callResolveId(getResolveId(plugin), context, './feature?one', importer)).toEqual({
      id: `${fs.realpathSync(preferred)}?one`,
    });
    expect(callResolveId(getResolveId(plugin), context, './feature#two', second)).toEqual({
      id: `${fs.realpathSync(preferred)}#two`,
    });
  });

  it('discards directory membership when a build ends with an error', async () => {
    const plugin = createPlugin(root);
    const context = createContext([importer, indexJs]);
    callBuildStart(plugin, context);
    callResolveId(getResolveId(plugin), context, './feature', importer);
    await callBuildEnd(plugin, context, new Error('Build failed'));
    const added = path.join(root, 'added.ts');
    fs.writeFileSync(added, 'export const value = 1;\n');
    const readdir = vi.spyOn(fs, 'readdirSync');

    callResolveId(getResolveId(plugin), context, './added', importer);

    expect(readdir).not.toHaveBeenCalled();
    expect(callHotUpdate(plugin, context, 'create', added, [])).toEqual([]);
  });

  it('does not suppress an atomic replacement with the same contents and mtime', () => {
    const plugin = createPlugin(root);
    const context = createContext([importer, indexJs]);
    callBuildStart(plugin, context);
    callResolveId(getResolveId(plugin), context, './feature', importer);
    const original = fs.statSync(indexJs);
    const replacement = path.join(featureDirectory, 'replacement.js');
    fs.writeFileSync(replacement, fs.readFileSync(indexJs));
    fs.utimesSync(replacement, original.atime, original.mtime);
    fs.renameSync(replacement, indexJs);
    expect(fs.statSync(indexJs).ino).not.toBe(original.ino);

    expect(callHotUpdate(plugin, context, 'create', indexJs, [indexJs])).toEqual([
      indexJs,
      importer,
    ]);
  });

  it('re-resolves a symlink candidate after its target is replaced', async () => {
    const linked = path.join(root, 'linked.ts');
    const replacement = path.join(root, 'replacement.ts');
    fs.symlinkSync(indexJs, linked);
    fs.writeFileSync(replacement, 'export const value = 2;\n');
    const plugin = createPlugin(root);
    const context = createContext([importer, indexJs]);
    callBuildStart(plugin, context);
    callResolveId(getResolveId(plugin), context, './linked', importer);
    await callBuildEnd(plugin, context);
    fs.unlinkSync(linked);
    fs.symlinkSync(replacement, linked);

    callWatchChange(plugin, context, 'create', linked);
    expect(callHotUpdate(plugin, context, 'create', linked, [])).toEqual([importer]);
    expect(callResolveId(getResolveId(plugin), context, './linked', importer)).toEqual({
      id: fs.realpathSync(replacement),
    });
  });

  it('discovers a directory index created after the target was snapshotted as a file', async () => {
    fs.rmSync(featureDirectory, { recursive: true });
    fs.writeFileSync(featureDirectory, 'export const value = 1;\n');
    const plugin = createPlugin(root);
    const context = createContext([importer, featureDirectory]);
    callBuildStart(plugin, context);
    callResolveId(getResolveId(plugin), context, './feature', importer);
    await callBuildEnd(plugin, context);
    fs.unlinkSync(featureDirectory);
    fs.mkdirSync(featureDirectory);
    fs.writeFileSync(indexJs, 'export const value = 2;\n');

    callWatchChange(plugin, context, 'create', featureDirectory);
    expect(callHotUpdate(plugin, context, 'create', featureDirectory, [])).toEqual([importer]);
    expect(callResolveId(getResolveId(plugin), context, './feature', importer)).toEqual({
      id: fs.realpathSync(indexJs),
    });
    expect(context.addWatchFile).toHaveBeenCalledWith(featureDirectory);
  });

  it('re-resolves when a directory target is replaced by an extensionless file', async () => {
    const plugin = createPlugin(root);
    const context = createContext([importer, indexJs]);
    callBuildStart(plugin, context);
    callResolveId(getResolveId(plugin), context, './feature', importer);
    await callBuildEnd(plugin, context);
    fs.rmSync(featureDirectory, { recursive: true });
    fs.writeFileSync(featureDirectory, 'export const value = 2;\n');

    callWatchChange(plugin, context, 'create', featureDirectory);
    expect(callHotUpdate(plugin, context, 'create', featureDirectory, [])).toEqual([importer]);
    expect(callResolveId(getResolveId(plugin), context, './feature', importer)).toEqual({
      id: fs.realpathSync(featureDirectory),
    });
  });

  it('suppresses pre-existing create events replayed when the watcher starts', () => {
    const plugin = createPlugin(root);
    const context = createContext([importer, indexJs]);
    const resolveId = getResolveId(plugin);

    callBuildStart(plugin, context);
    callResolveId(resolveId, context, './feature', importer);

    callWatchChange(plugin, context, 'create', importer);
    expect(callHotUpdate(plugin, context, 'create', importer, [importer])).toEqual([]);
    expect(callHotUpdate(plugin, context, 'create', indexJs, [indexJs])).toEqual([]);
  });

  it('does not suppress create events for files changed after tracking', () => {
    const plugin = createPlugin(root);
    const context = createContext([importer, indexJs]);
    const resolveId = getResolveId(plugin);

    callBuildStart(plugin, context);
    callResolveId(resolveId, context, './feature', importer);
    fs.writeFileSync(importer, "import { value } from './feature';\n// changed\n");

    callWatchChange(plugin, context, 'create', importer);
    expect(callHotUpdate(plugin, context, 'create', importer, [importer])).toBeUndefined();
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

  it('does not use filesystem timestamps to classify create events', () => {
    const indexTs = path.join(featureDirectory, 'index.ts');
    const plugin = createPlugin(root);
    const context = createContext([importer, indexJs]);
    const resolveId = getResolveId(plugin);
    const skewedBuildTime = Date.now() + 1_000;
    vi.spyOn(Date, 'now').mockReturnValue(skewedBuildTime);

    callBuildStart(plugin, context);
    callResolveId(resolveId, context, './feature', importer);
    fs.writeFileSync(indexTs, "export const value = 'ts';\n");

    expect(callHotUpdate(plugin, context, 'create', indexTs, [])).toEqual([importer]);
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

function callBuildEnd(plugin: rolldown.Plugin, context: rolldown.PluginContext, error?: Error) {
  if (typeof plugin.buildEnd === 'function') {
    return plugin.buildEnd.call(context, error);
  }
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
