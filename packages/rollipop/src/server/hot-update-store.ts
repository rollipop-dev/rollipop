import fs from 'node:fs';
import path from 'node:path';

import { SourceMapConsumer } from 'source-map';

import { FileStorage } from '../storage/file-storage';
import type { BundleStore } from './bundle';

export const HOT_UPDATE_ROUTE_PREFIX = '/hot';

export interface HotUpdatePatch {
  code: string;
  filename: string;
  sourcemap?: string | null;
  sourcemapFilename?: string | null;
}

export function getHotUpdatePath(id: string, filename: string) {
  assertPathSegment(id, 'id');
  assertPathSegment(filename, 'filename');

  return `${HOT_UPDATE_ROUTE_PREFIX}/${encodeURIComponent(id)}/${encodeURIComponent(filename)}`;
}

export function parseHotUpdatePath(pathname: string): { id: string; filename: string } | null {
  const prefix = `${HOT_UPDATE_ROUTE_PREFIX}/`;
  if (!pathname.startsWith(prefix)) {
    return null;
  }

  const segments = pathname.slice(prefix.length).split('/');
  if (segments.length !== 2) {
    return null;
  }

  try {
    const id = decodeURIComponent(segments[0]!);
    const filename = decodeURIComponent(segments[1]!);

    return isPathSegment(id) && isPathSegment(filename) ? { id, filename } : null;
  } catch {
    return null;
  }
}

export class HotUpdateStore {
  private readonly hotPath: string;
  private readonly patches = new Map<string, Map<string, string | null>>();

  constructor(projectRoot: string) {
    this.hotPath = path.join(FileStorage.getPath(projectRoot), 'hot');
  }

  clear() {
    this.patches.clear();
    try {
      fs.rmSync(this.hotPath, { recursive: true, force: true });
    } catch {
      // Hot update cleanup is best-effort.
    }
  }

  write(id: string, patch: HotUpdatePatch) {
    assertPathSegment(id, 'id');
    assertPathSegment(patch.filename, 'filename');

    const hasSourcemap = patch.sourcemap != null;
    const hasSourcemapFilename = patch.sourcemapFilename != null;
    if (hasSourcemap !== hasSourcemapFilename) {
      throw new Error('Hot update sourcemap and sourcemapFilename must be provided together');
    }
    if (patch.sourcemapFilename != null) {
      assertPathSegment(patch.sourcemapFilename, 'sourcemapFilename');
    }

    const directoryPath = this.getDirectoryPath(id);
    fs.mkdirSync(directoryPath, { recursive: true });

    if (patch.sourcemap != null && patch.sourcemapFilename != null) {
      fs.writeFileSync(this.getFilePath(id, patch.sourcemapFilename), patch.sourcemap, 'utf-8');
    }
    fs.writeFileSync(this.getFilePath(id, patch.filename), patch.code, 'utf-8');

    const patches = this.patches.get(id) ?? new Map<string, string | null>();
    patches.set(patch.filename, patch.sourcemapFilename ?? null);
    this.patches.set(id, patches);
  }

  list(id: string) {
    assertPathSegment(id, 'id');

    return Array.from(this.patches.get(id)?.keys() ?? [])
      .flatMap((filename) => {
        const stats = fs.statSync(this.getFilePath(id, filename), { throwIfNoEntry: false });
        if (!stats?.isFile()) return [];

        return [
          {
            filename,
            sourcemapFilename: this.getSourcemapFilename(id, filename),
            updatedAt: stats.mtimeMs,
          },
        ];
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  resolve(id: string, filename: string): BundleStore | undefined {
    assertPathSegment(id, 'id');
    assertPathSegment(filename, 'filename');

    const bundleFilePath = this.getFilePath(id, filename);
    if (!isFile(bundleFilePath)) {
      return undefined;
    }

    const sourcemapFilename = this.getSourcemapFilename(id, filename);

    return new HotUpdateBundleStore(
      bundleFilePath,
      sourcemapFilename == null ? undefined : this.getFilePath(id, sourcemapFilename),
    );
  }

  readAsset(id: string, filename: string): Buffer | undefined {
    assertPathSegment(id, 'id');
    assertPathSegment(filename, 'filename');

    const filePath = this.getFilePath(id, filename);
    return isFile(filePath) ? fs.readFileSync(filePath) : undefined;
  }

  private getSourcemapFilename(id: string, filename: string): string | null {
    const storedFilename = this.patches.get(id)?.get(filename);
    const sourcemapFilename = storedFilename === undefined ? `${filename}.map` : storedFilename;
    return sourcemapFilename != null && isFile(this.getFilePath(id, sourcemapFilename))
      ? sourcemapFilename
      : null;
  }

  private getDirectoryPath(id: string) {
    return path.join(this.hotPath, id);
  }

  private getFilePath(id: string, filename: string) {
    return path.join(this.getDirectoryPath(id), filename);
  }
}

class HotUpdateBundleStore implements BundleStore {
  private lazySourceMapConsumer: NonNullable<BundleStore['sourceMapConsumer']> | null = null;

  constructor(
    readonly bundleFilePath: string,
    private readonly sourcemapFilePath: string | undefined,
  ) {}

  get code() {
    return fs.readFileSync(this.bundleFilePath, 'utf-8');
  }

  get sourceMap() {
    return this.sourcemapFilePath != null && isFile(this.sourcemapFilePath)
      ? fs.readFileSync(this.sourcemapFilePath, 'utf-8')
      : undefined;
  }

  get sourceMapConsumer() {
    if (this.lazySourceMapConsumer == null) {
      const sourceMap = this.sourceMap;
      if (sourceMap == null) {
        return undefined;
      }
      this.lazySourceMapConsumer = new SourceMapConsumer(sourceMap);
    }

    return this.lazySourceMapConsumer;
  }
}

function assertPathSegment(value: string, name: string): void {
  if (!isPathSegment(value)) {
    throw new Error(`Invalid hot update ${name}: expected a single path segment`);
  }
}

function isPathSegment(value: string) {
  return (
    value.length > 0 &&
    value !== '.' &&
    value !== '..' &&
    !value.includes('/') &&
    !value.includes('\\') &&
    !value.includes('\0')
  );
}

function isFile(filePath: string) {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}
