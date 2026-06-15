import type { OutputChunk } from '@rollipop/rolldown';
import { invariant } from 'es-toolkit';

import type { ResolvedConfig } from '../config';
import { Bundler } from '../core/bundler';
import type { BuildOptions, DevEngine } from '../core/types';
import type { ReportableEvent } from '../types';
import { getBaseBundleName } from '../utils/bundle';
import { bindReporter } from '../utils/config';
import { normalizeRolldownError } from '../utils/errors';
import { taskHandler } from '../utils/promise';
import { type BundleStore, FileSystemBundleStore } from './bundle';
import type { ServerEventBus } from './events/event-bus';
import { logger } from './logger';
import type { ServerOptions } from './types';

export interface DevServerOptions {
  host: string;
  port: number;
}

export interface BundlerDevEngineOptions {
  server: DevServerOptions;
}

export type BundlerStatus = 'idle' | 'building' | 'build-done' | 'build-failed';
type BundleBuildDoneEvent = Extract<ReportableEvent, { type: 'bundle_build_done' }>;

export class BundlerDevEngine {
  private readonly initializeHandle: ReturnType<typeof taskHandler>;
  private readonly isHmrEnabled: boolean;
  private readonly _id: string;
  private bundleStore: BundleStore | null = null;
  private buildFailedError: Error | null = null;
  private _devEngine: DevEngine | null = null;
  private _state: 'idle' | 'initializing' | 'ready' = 'idle';
  private _status: BundlerStatus = 'idle';

  constructor(
    private readonly options: BundlerDevEngineOptions,
    private readonly config: ResolvedConfig,
    private readonly buildOptions: BuildOptions,
    private readonly eventBus: ServerEventBus,
  ) {
    this._id = Bundler.createId(config, buildOptions);
    this.initializeHandle = taskHandler();
    this.isHmrEnabled = Boolean(buildOptions.dev && config.devMode.hmr);

    void this.initialize();
  }

  get id() {
    return this._id;
  }

  /** Snapshot of the bundler's current lifecycle state. */
  get status(): BundlerStatus {
    return this._status;
  }

  get devEngine() {
    invariant(this._devEngine, 'DevEngine is not initialized');
    return this._devEngine;
  }

  get ensureInitialized() {
    return this.initializeHandle.task;
  }

  private async initialize() {
    if (this._state !== 'idle' || this._devEngine != null) {
      return this;
    }

    this._state = 'initializing';

    let pendingBuildDoneEvent: BundleBuildDoneEvent | null = null;
    const emitReportableEvent = (event: ReportableEvent) => {
      switch (event.type) {
        case 'bundle_build_started':
          this._status = 'building';
          break;

        case 'bundle_build_done':
          this._status = 'build-done';
          break;

        case 'bundle_build_failed':
          this._status = 'build-failed';
          break;
      }

      this.eventBus.emit({ ...event, bundlerId: this.id });
    };

    const config = bindReporter(this.config, (event) => {
      if (event.type === 'bundle_build_started') {
        pendingBuildDoneEvent = null;
      }
      if (event.type === 'bundle_build_done') {
        pendingBuildDoneEvent = event;
        return;
      }
      emitReportableEvent(event);
    });

    const devEngine = await Bundler.devEngine(config, this.buildOptions, {
      host: this.options.server.host,
      port: this.options.server.port,
      onHmrUpdates: (errorOrResult) => {
        if (errorOrResult instanceof Error) {
          logger.error('Failed to handle HMR updates', {
            bundlerId: this.id,
            error: errorOrResult,
          });
          const normalizedError = normalizeRolldownError(errorOrResult);
          const event: ReportableEvent = {
            type: 'hmr_failed',
            error: normalizedError,
          };
          this.eventBus.emit({ ...event, bundlerId: this.id });
        } else if (this.isHmrEnabled) {
          logger.trace('Detected changed files', {
            bundlerId: this.id,
            changedFiles: errorOrResult.changedFiles,
          });
          this.eventBus.emit({
            bundlerId: this.id,
            type: 'hmr_updates',
            updates: errorOrResult.updates,
          });
        }
      },
      onOutput: (errorOrResult) => {
        if (errorOrResult instanceof Error) {
          pendingBuildDoneEvent = null;
          const normalizedError = normalizeRolldownError(errorOrResult);
          logger.trace('onOutput', { bundlerId: this.id });
          logger.error(errorOrResult.message);
          this.buildFailedError = normalizedError;
          const event: ReportableEvent = {
            type: 'bundle_build_failed',
            error: normalizedError,
          };
          this._status = 'build-failed';
          this.eventBus.emit({ ...event, bundlerId: this.id });
        } else {
          const output = errorOrResult.output[0];
          const bundleStore = this.updateBundleStore(output);
          this.buildFailedError = null;
          logger.debug('Build completed', {
            bundlerId: this.id,
            bundleName: output.name,
            bundleFilePath: bundleStore.bundleFilePath,
          });
          if (pendingBuildDoneEvent != null) {
            emitReportableEvent({
              ...pendingBuildDoneEvent,
              bundleFilePath: bundleStore.bundleFilePath,
            });
            pendingBuildDoneEvent = null;
          }
        }
      },
      rebuildStrategy: 'auto',
    });

    await devEngine.run();
    this._devEngine = devEngine;
    this._state = 'ready';
    this.initializeHandle.resolve();
  }

  private updateBundleStore(output: OutputChunk): BundleStore {
    this.bundleStore = new FileSystemBundleStore(
      this.config.root,
      this.id,
      output.code,
      output.map?.toString(),
    );
    return this.bundleStore;
  }

  async getBundle() {
    await this.ensureInitialized;

    const state = await this.devEngine.getBundleState();
    logger.debug('Bundle state', { bundlerId: this.id, state });
    if (state.lastFullBuildFailed) {
      throw new Error(this.buildFailedError?.message ?? 'Build failed');
    }
    if (state.hasStaleOutput || this.bundleStore == null) {
      await this.devEngine.ensureLatestBuildOutput();
    }
    invariant(this.bundleStore, 'Bundle is not available');

    return this.bundleStore;
  }
}

export class BundlerPool {
  private static readonly instances: Map<string, BundlerDevEngine> = new Map();

  constructor(
    private readonly config: ResolvedConfig,
    private readonly resolvedServerOptions: Required<Pick<ServerOptions, 'host' | 'port'>>,
    private readonly eventBus: ServerEventBus,
  ) {}

  get(bundleName: string, buildOptions: Pick<BuildOptions, 'platform' | 'dev'>) {
    const baseBundleName = getBaseBundleName(bundleName);
    const bundlerId = Bundler.createId(this.config, buildOptions);
    const key = `${baseBundleName}-${bundlerId}`;
    const instance = BundlerPool.instances.get(key);

    if (instance) {
      return instance;
    } else {
      logger.debug('Preparing new bundler instance', { bundleName, key });
      const instance = new BundlerDevEngine(
        {
          server: this.resolvedServerOptions,
        },
        this.config,
        buildOptions,
        this.eventBus,
      );
      logger.debug('Setting new bundler instance', { key });
      BundlerPool.instances.set(key, instance);

      return instance;
    }
  }

  /**
   * Look up a cached bundler by the id carried as `bundlerId` in events such as `bundle_build_done`. Returns `undefined` when no instance with that id has been created yet.
   */
  getInstanceById(id: string): BundlerDevEngine | undefined {
    for (const instance of BundlerPool.instances.values()) {
      if (instance.id === id) {
        return instance;
      }
    }
    return undefined;
  }
}
