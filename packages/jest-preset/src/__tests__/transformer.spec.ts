import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import { createTransformer } from '../transformer';

const mocks = vi.hoisted(() => ({
  configs: [] as { swc: { plugins?: unknown[] }; [key: string]: unknown }[],
  loadEnv: vi.fn<() => Record<string, string>>(),
  transformSync: vi.fn((filename: string, source: string) => ({
    code: `sync:${filename}:${source}`,
    map: 'sync-map',
  })),
  transform: vi.fn(async (filename: string, source: string) => ({
    code: `async:${filename}:${source}`,
    map: 'async-map',
  })),
}));

vi.mock('rollipop', () => ({
  Constants: { DEFAULT_ENV_FILE: '.env', DEFAULT_ENV_PREFIX: 'PUBLIC_' },
  loadEnv: mocks.loadEnv,
  rolldownExperimental: {
    RollipopReactNativeTransformer: class {
      constructor(config: (typeof mocks.configs)[number]) {
        mocks.configs.push(config);
      }
      transformSync = mocks.transformSync;
      transform = mocks.transform;
    },
  },
}));

const jestOptions = { configString: '{}', instrument: false, supportsStaticESM: false };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.configs.length = 0;
  mocks.loadEnv.mockReturnValue({ PUBLIC_API: 'initial' });
});

describe('createTransformer', () => {
  it('lazily reuses native Jest pipelines for sync CJS and async ESM transforms', async () => {
    const transformer = createTransformer({
      mode: 'production',
      runtimeTarget: 'hermes-v1',
      flow: { requireDirective: true },
      worklets: { isRelease: true },
    });
    expect(mocks.configs).toHaveLength(0);
    expect(transformer.process('source', '/input.ts')).toEqual({
      code: 'sync:/input.ts:source',
      map: 'sync-map',
    });
    transformer.process('again', '/another.ts', jestOptions);
    const esmOptions = { ...jestOptions, supportsStaticESM: true };
    expect(await transformer.processAsync('source', '/input.ts', esmOptions)).toEqual({
      code: 'async:/input.ts:source',
      map: 'async-map',
    });
    await transformer.processAsync('again', '/another.ts', esmOptions);
    expect(mocks.configs).toHaveLength(2);
    expect(mocks.configs[0]).toMatchObject({
      envName: 'production',
      runtimeTarget: 'hermes-v1',
      flow: { requireDirective: true },
      worklets: { isRelease: true },
      swc: {
        jest: true,
        module: { type: 'commonjs' },
        react: { development: false, runtime: 'Automatic' },
        globals: {
          'import.meta.env.PUBLIC_API': '"initial"',
          'import.meta.glob': `require('@rollipop/jest-preset/mock').createGlobImport(__filename);`,
        },
      },
    });
    expect(mocks.configs[1]).toMatchObject({
      swc: {
        jest: true,
        module: { type: 'unambiguous' },
        globals: {
          'import.meta.glob': `import.meta.jest.requireActual('@rollipop/jest-preset/mock').createGlobImport(import.meta.jest.requireActual("node:url").fileURLToPath(import.meta.url));`,
        },
      },
    });
    expect(mocks.transformSync).toHaveBeenLastCalledWith('/another.ts', 'again');
    expect(mocks.transform).toHaveBeenLastCalledWith('/another.ts', 'again');
  });

  it.each([undefined, false])('does not instrument without explicit opt-in: %s', (enabled) => {
    const transformer = createTransformer(
      enabled === undefined
        ? {}
        : {
            experimental: { customCoverageInstrumentation: { enabled } },
          },
    );
    expect(transformer.canInstrument).toBe(false);
    transformer.process('source', '/input.ts', { ...jestOptions, instrument: true });
    transformer.process('source', '/input.ts', jestOptions);
    expect(mocks.configs).toHaveLength(1);
    expect(mocks.configs[0]).toMatchObject({ swc: { jest: true } });
    expect(mocks.configs[0].swc.plugins ?? []).toHaveLength(0);
  });

  it('keeps native pipelines and resolved environments isolated between transformers', () => {
    const first = createTransformer({ mode: 'development' });
    mocks.loadEnv.mockReturnValue({ PUBLIC_API: 'second' });
    const second = createTransformer({ mode: 'production' });
    first.process('source', '/input.ts', jestOptions);
    second.process('source', '/input.ts', jestOptions);
    first.process('again', '/input.ts', jestOptions);

    expect(mocks.configs).toHaveLength(2);
    expect(mocks.configs[0]).toMatchObject({
      envName: 'development',
      swc: { globals: { 'import.meta.env.PUBLIC_API': '"initial"' } },
    });
    expect(mocks.configs[1]).toMatchObject({
      envName: 'production',
      swc: { globals: { 'import.meta.env.PUBLIC_API': '"second"' } },
    });
  });

  it('loads coverage only when requested and caches each module/coverage combination', async () => {
    const coverageConfig = {
      coverageVariable: '__test_coverage__',
      compact: false,
      reportLogic: true,
      ignoreClassMethods: ['render'],
      instrumentLog: { level: 'warn', enableTrace: false },
    };
    const transformer = createTransformer({
      experimental: { customCoverageInstrumentation: { enabled: true, ...coverageConfig } },
    });
    expect(transformer.canInstrument).toBe(true);
    expect(mocks.configs).toHaveLength(0);
    transformer.process('plain', '/input.ts', jestOptions);
    transformer.process('covered', '/input.ts', { ...jestOptions, instrument: true });
    await transformer.processAsync('covered', '/input.ts', { ...jestOptions, instrument: true });
    transformer.process('plain', '/input.ts', { ...jestOptions, supportsStaticESM: true });
    await transformer.processAsync('covered', '/input.ts', {
      ...jestOptions,
      instrument: true,
      supportsStaticESM: true,
    });
    expect(mocks.configs).toHaveLength(4);
    for (const index of [0, 2]) {
      expect(mocks.configs[index].swc.plugins ?? []).toHaveLength(0);
    }
    for (const index of [1, 3]) {
      expect(mocks.configs[index]).toMatchObject({ swc: { jest: true } });
      expect(mocks.configs[index].swc.plugins).toEqual([
        [expect.stringContaining('swc-plugin-coverage-instrument'), coverageConfig],
      ]);
    }
    expect(mocks.configs[3]).toMatchObject({ swc: { module: { type: 'unambiguous' } } });
  });

  it('invalidates the cache for Jest configuration, instrumentation, module mode, and source', () => {
    const transformer = createTransformer();
    const baseline = transformer.getCacheKey('source', '/input.ts', jestOptions);
    expect(transformer.getCacheKey('source', '/input.ts', jestOptions)).toBe(baseline);
    const variants = [
      transformer.getCacheKey('changed', '/input.ts', jestOptions),
      transformer.getCacheKey('source', '/other.ts', jestOptions),
      transformer.getCacheKey('source', '/input.ts', {
        ...jestOptions,
        configString: '{"test":1}',
      }),
      transformer.getCacheKey('source', '/input.ts', { ...jestOptions, instrument: true }),
      transformer.getCacheKey('source', '/input.ts', { ...jestOptions, supportsStaticESM: true }),
    ];
    expect(new Set([baseline, ...variants]).size).toBe(variants.length + 1);
    expect(mocks.configs).toHaveLength(0);
  });

  it('includes resolved environment and transformer options in the cache key', () => {
    const first = createTransformer({ mode: 'development' });
    const key = first.getCacheKey('source', '/input.ts', jestOptions);
    mocks.loadEnv.mockReturnValue({ PUBLIC_API: 'changed' });
    const changedEnv = createTransformer({ mode: 'development' });
    expect(changedEnv.getCacheKey('source', '/input.ts', jestOptions)).not.toBe(key);
    mocks.loadEnv.mockReturnValue({ PUBLIC_API: 'initial' });
    const changedMode = createTransformer({ mode: 'production' });
    expect(changedMode.getCacheKey('source', '/input.ts', jestOptions)).not.toBe(key);
    expect(first.getCacheKey('source', '/input.ts', jestOptions)).toBe(key);
  });
});
