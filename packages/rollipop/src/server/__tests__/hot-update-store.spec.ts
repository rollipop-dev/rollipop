import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import { getHotUpdatePath, HotUpdateStore, parseHotUpdatePath } from '../hot-update-store';

const ID = 'ios-dev';
const PATCH_FILENAME = 'hmr patch 0.js';
const SOURCEMAP_FILENAME = 'hmr patch 0.js.map';
const SOURCEMAP = JSON.stringify({
  version: 3,
  file: PATCH_FILENAME,
  sources: ['App.tsx'],
  sourcesContent: ['throw new Error();'],
  names: [],
  mappings: 'AAAA',
});

describe('hot update path', () => {
  it('round-trips encoded path segments', () => {
    const pathname = getHotUpdatePath(ID, PATCH_FILENAME);

    expect(pathname).toBe('/hot/ios-dev/hmr%20patch%200.js');
    expect(parseHotUpdatePath(pathname)).toEqual({ id: ID, filename: PATCH_FILENAME });
  });

  it.each([
    '/other/ios-dev/hmr_patch_0.js',
    '/hot/ios-dev',
    '/hot/ios-dev/nested/hmr_patch_0.js',
    '/hot/../hmr_patch_0.js',
    '/hot/ios-dev/%2Ftmp%2Fpatch.js',
    '/hot/ios-dev/%5Ctmp%5Cpatch.js',
    '/hot/ios-dev/%E0%A4%A',
  ])('rejects invalid path %s', (pathname) => {
    expect(parseHotUpdatePath(pathname)).toBeNull();
  });

  it('rejects invalid segments when creating a URL', () => {
    expect(() => getHotUpdatePath('../ios-dev', 'hmr_patch_0.js')).toThrow(
      'expected a single path segment',
    );
    expect(() => getHotUpdatePath(ID, '../hmr_patch_0.js')).toThrow(
      'expected a single path segment',
    );
  });
});

describe('HotUpdateStore', () => {
  let projectRoot: string;
  let hotPath: string;

  beforeEach(() => {
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rollipop-hot-update-'));
    hotPath = path.join(projectRoot, '.rollipop', 'hot');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(projectRoot, { recursive: true, force: true });
  });

  it('clears only its id the first time it is prepared', () => {
    const idPath = path.join(hotPath, ID);
    const otherIdPath = path.join(hotPath, 'android-dev');
    fs.mkdirSync(idPath, { recursive: true });
    fs.mkdirSync(otherIdPath, { recursive: true });
    fs.writeFileSync(path.join(idPath, 'stale.js'), 'stale');
    fs.writeFileSync(path.join(otherIdPath, 'keep.js'), 'keep');

    const store = new HotUpdateStore(projectRoot);
    store.prepare(ID);

    expect(fs.existsSync(path.join(idPath, 'stale.js'))).toBe(false);
    expect(fs.readFileSync(path.join(otherIdPath, 'keep.js'), 'utf-8')).toBe('keep');

    store.write(ID, { code: 'current', filename: 'current.js' });
    store.prepare(ID);

    expect(fs.readFileSync(path.join(idPath, 'current.js'), 'utf-8')).toBe('current');
  });

  it('does not clear existing files when writing an update', () => {
    const idPath = path.join(hotPath, ID);
    fs.mkdirSync(idPath, { recursive: true });
    fs.writeFileSync(path.join(idPath, 'existing.js'), 'existing');

    new HotUpdateStore(projectRoot).write(ID, { code: 'current', filename: 'current.js' });

    expect(fs.readFileSync(path.join(idPath, 'existing.js'), 'utf-8')).toBe('existing');
    expect(fs.readFileSync(path.join(idPath, 'current.js'), 'utf-8')).toBe('current');
  });

  it('writes the sourcemap before the exact patch code', () => {
    const store = new HotUpdateStore(projectRoot);
    const writeFileSync = fs.writeFileSync.bind(fs);
    const writes: string[] = [];
    vi.spyOn(fs, 'writeFileSync').mockImplementation((file, data, options) => {
      writes.push(String(file));
      return writeFileSync(file, data, options);
    });

    store.write(ID, {
      code: 'applyPatch();\n//# sourceMappingURL=hmr patch 0.js.map',
      filename: PATCH_FILENAME,
      sourcemap: SOURCEMAP,
      sourcemapFilename: SOURCEMAP_FILENAME,
    });

    expect(writes).toEqual([
      path.join(hotPath, ID, SOURCEMAP_FILENAME),
      path.join(hotPath, ID, PATCH_FILENAME),
    ]);
    expect(fs.readFileSync(path.join(hotPath, ID, PATCH_FILENAME), 'utf-8')).toBe(
      'applyPatch();\n//# sourceMappingURL=hmr patch 0.js.map',
    );
    expect(fs.readFileSync(path.join(hotPath, ID, SOURCEMAP_FILENAME), 'utf-8')).toBe(SOURCEMAP);
  });

  it('resolves a persisted BundleStore without eagerly reading the patch or sourcemap', async () => {
    const writer = new HotUpdateStore(projectRoot);
    writer.write(ID, {
      code: 'throw new Error();',
      filename: PATCH_FILENAME,
      sourcemap: SOURCEMAP,
      sourcemapFilename: SOURCEMAP_FILENAME,
    });
    const readFileSync = vi.spyOn(fs, 'readFileSync');

    const bundle = new HotUpdateStore(projectRoot).resolve(ID, PATCH_FILENAME);

    expect(bundle).toBeDefined();
    expect(readFileSync).not.toHaveBeenCalled();
    expect(bundle?.code).toBe('throw new Error();');
    expect(readFileSync).toHaveBeenCalledTimes(1);

    const consumer = await bundle?.sourceMapConsumer;
    expect(consumer?.originalPositionFor({ line: 1, column: 0 })).toEqual({
      source: 'App.tsx',
      line: 1,
      column: 0,
      name: null,
    });
    consumer?.destroy();
  });

  it('reads stored assets and returns undefined for missing assets', () => {
    const store = new HotUpdateStore(projectRoot);
    store.write(ID, { code: 'applyPatch();', filename: PATCH_FILENAME });

    expect(store.readAsset(ID, PATCH_FILENAME)?.toString('utf-8')).toBe('applyPatch();');
    expect(store.readAsset(ID, 'missing.js')).toBeUndefined();
    expect(store.resolve(ID, 'missing.js')).toBeUndefined();
  });

  it('requires a sourcemap and filename pair', () => {
    const store = new HotUpdateStore(projectRoot);

    expect(() =>
      store.write(ID, {
        code: 'applyPatch();',
        filename: PATCH_FILENAME,
        sourcemap: SOURCEMAP,
      }),
    ).toThrow('must be provided together');
  });

  it('rejects path traversal in storage operations', () => {
    const store = new HotUpdateStore(projectRoot);

    expect(() => store.prepare('../ios-dev')).toThrow('expected a single path segment');
    expect(() => store.write(ID, { code: '', filename: '../patch.js' })).toThrow(
      'expected a single path segment',
    );
    expect(() => store.readAsset(ID, '..')).toThrow('expected a single path segment');
  });
});
