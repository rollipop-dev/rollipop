import fs from 'node:fs';
import path from 'node:path';

import {
  SourceMapConsumer,
  type BasicSourceMapConsumer,
  type IndexedSourceMapConsumer,
} from 'source-map';

import { logger } from '../logger';
import { FileStorage } from '../storage/file-storage';

type SourceMapConsumerType = BasicSourceMapConsumer | IndexedSourceMapConsumer;

export interface BundleStore {
  bundleFilePath: string;
  code: string;
  sourceMap: string | undefined;
  sourceMapConsumer: Promise<SourceMapConsumerType> | undefined;
}

export class FileSystemBundleStore implements BundleStore {
  readonly bundleFilePath: string;
  private readonly _sourceMap: string | undefined;
  private lazySourceMapConsumer: Promise<SourceMapConsumerType> | null = null;
  private holder: { code: string; mtimeMs: number };

  constructor(projectRoot: string, id: string, code: string, sourceMap: string | undefined) {
    const sharedDataPath = FileStorage.getPath(projectRoot);
    const bundlesPath = path.join(sharedDataPath, 'bundles');
    const bundleFilePath = path.join(bundlesPath, `${id}.bundle`);

    if (!fs.existsSync(bundlesPath)) {
      fs.mkdirSync(bundlesPath, { recursive: true });
    }

    fs.writeFileSync(bundleFilePath, code, { encoding: 'utf-8' });
    const stats = fs.statSync(bundleFilePath);

    this.bundleFilePath = bundleFilePath;
    this._sourceMap = sourceMap;
    this.holder = {
      code,
      mtimeMs: stats.mtimeMs,
    };

    logger.debug(`Local bundle stored at ${bundleFilePath}`);
  }

  private update() {
    const code = fs.readFileSync(this.bundleFilePath, { encoding: 'utf-8' });
    const stats = fs.statSync(this.bundleFilePath);
    this.holder = {
      code,
      mtimeMs: stats.mtimeMs,
    };
  }

  get code() {
    if (this.isStale()) {
      logger.info('Local bundle is stale, updating...');
      this.update();
    } else {
      logger.trace('Local bundle is up to date');
    }
    return this.holder.code;
  }

  get sourceMap() {
    // A modified fs bundle no longer matches the cached source map.
    return this.isStale() ? undefined : this._sourceMap;
  }

  get sourceMapConsumer() {
    if (this.isStale() || this._sourceMap == null) {
      return undefined;
    }
    if (this.lazySourceMapConsumer == null) {
      this.lazySourceMapConsumer = new SourceMapConsumer(this._sourceMap);
    }
    return this.lazySourceMapConsumer;
  }

  isStale() {
    return this.holder.mtimeMs !== fs.statSync(this.bundleFilePath).mtimeMs;
  }
}
