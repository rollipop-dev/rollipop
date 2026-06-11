import type * as rolldown from '@rollipop/rolldown';
import { describe, it, expect } from 'vite-plus/test';

import type { BundlerContext } from '../../../types';
import {
  setFlag,
  hasFlag,
  TransformFlag,
  TRANSFORM_FLAGS_KEY,
  REVISION_KEY,
  getFlag,
  getFlagFromModuleInfo,
  withTransformBoundary,
} from '../transform-utils';

type InitialModuleInfo =
  | TransformFlag
  | {
      flag: TransformFlag;
      revision?: number;
    };

function createBundlerContext(revision = 1): BundlerContext {
  return {
    id: 'test-bundler',
    root: '/test',
    buildType: 'serve',
    storage: {} as BundlerContext['storage'],
    state: { revision, latestBuildStartTime: 0 },
  };
}

function createPluginContext(initialModuleInfo: Record<string, InitialModuleInfo> = {}) {
  return {
    meta: {},
    getModuleInfo: (id: string) => {
      const info = initialModuleInfo[id];
      return {
        meta:
          info == null
            ? {}
            : {
                [TRANSFORM_FLAGS_KEY]: typeof info === 'number' ? info : info.flag,
                [REVISION_KEY]: typeof info === 'number' ? 1 : (info.revision ?? 1),
              },
      };
    },
  } as unknown as rolldown.PluginContext;
}

function flag(meta: any) {
  return meta[TRANSFORM_FLAGS_KEY];
}

function revision(meta: any) {
  return meta[REVISION_KEY];
}

describe('setFlag', () => {
  it('should set the flag', () => {
    const id = 'test.js';
    const pluginContext = createPluginContext();
    const bundlerContext = createBundlerContext();
    expect(hasFlag(pluginContext.meta)).toBe(false);

    const meta = setFlag.call(pluginContext, bundlerContext, id, TransformFlag.CODEGEN_REQUIRED);
    expect(flag(meta)).toBe(TransformFlag.CODEGEN_REQUIRED);
    expect(revision(meta)).toBe(1);
  });

  describe('when the module info exists', () => {
    it('should merge flags from the same revision', () => {
      const id = 'test.js';
      const pluginContext = createPluginContext({
        [id]: TransformFlag.CODEGEN_REQUIRED,
      });
      const bundlerContext = createBundlerContext();

      const meta = setFlag.call(
        pluginContext,
        bundlerContext,
        id,
        TransformFlag.STRIP_FLOW_REQUIRED,
      );

      expect(
        Boolean(flag(meta) & (TransformFlag.CODEGEN_REQUIRED | TransformFlag.STRIP_FLOW_REQUIRED)),
      ).toBe(true);
      expect(revision(meta)).toBe(1);
    });

    it('should ignore stale flags from a previous revision', () => {
      const id = 'test.js';
      const pluginContext = createPluginContext({
        [id]: { flag: TransformFlag.SKIP_ALL, revision: 1 },
      });
      const bundlerContext = createBundlerContext(2);

      const meta = setFlag.call(pluginContext, bundlerContext, id, TransformFlag.CODEGEN_REQUIRED);

      expect(flag(meta)).toBe(TransformFlag.CODEGEN_REQUIRED);
      expect(revision(meta)).toBe(2);
    });
  });
});

describe('getFlag', () => {
  it('should read flags from the current revision', () => {
    const id = 'test.js';
    const pluginContext = createPluginContext({
      [id]: { flag: TransformFlag.SKIP_ALL, revision: 2 },
    });
    const bundlerContext = createBundlerContext(2);

    expect(getFlag.call(pluginContext, bundlerContext, id)).toBe(TransformFlag.SKIP_ALL);
  });

  it('should ignore flags from a stale revision', () => {
    const id = 'test.js';
    const pluginContext = createPluginContext({
      [id]: { flag: TransformFlag.SKIP_ALL, revision: 1 },
    });
    const bundlerContext = createBundlerContext(2);

    expect(getFlag.call(pluginContext, bundlerContext, id)).toBe(TransformFlag.NONE);
  });

  it('should ignore flags without a revision', () => {
    const bundlerContext = createBundlerContext(2);

    expect(
      getFlagFromModuleInfo(bundlerContext, {
        meta: { [TRANSFORM_FLAGS_KEY]: TransformFlag.SKIP_ALL },
      } as unknown as rolldown.ModuleInfo),
    ).toBe(TransformFlag.NONE);
  });
});

describe('withTransformBoundary', () => {
  it('should initialize the bundle state on build start', async () => {
    const bundlerContext = createBundlerContext(0);
    const [initializerPlugin] = withTransformBoundary(bundlerContext, []) as rolldown.Plugin[];
    const beforeBuildStart = Date.now();

    if (typeof initializerPlugin?.buildStart === 'function') {
      await initializerPlugin.buildStart.call({} as rolldown.PluginContext, {} as any);
    }

    expect(bundlerContext.state.revision).toBe(1);
    expect(bundlerContext.state.latestBuildStartTime).toBeGreaterThanOrEqual(beforeBuildStart);
  });
});
