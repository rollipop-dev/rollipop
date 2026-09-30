import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

import { Constants, loadEnv, rolldownExperimental } from 'rollipop';

import { defineEnvFromObject } from './env';
import { GLOB_IMPORT_HELPERS } from './runtime';
import type { TransformerOptions } from './transformer';

export interface TransformOptions {
  configString?: string;
  instrument?: boolean;
  supportsStaticESM?: boolean;
}

interface Context {
  options: TransformerOptions;
  mode: 'development' | 'production';
  globals: Record<string, string | undefined>;
  canInstrument: boolean;
  instrumentOptions: Record<string, unknown>;
  optionsHash: string;
  pipelines: Map<number, rolldownExperimental.RollipopReactNativeTransformer>;
  coveragePlugin?: { path: string; version: string };
}

function resolveMode(
  mode = process.env.NODE_ENV as TransformerOptions['mode'],
): NonNullable<TransformerOptions['mode']> {
  switch (mode) {
    case 'development':
    case 'production':
      return mode;
    default:
      return 'development';
  }
}

function packageVersion(packageJsonPath: string): string {
  try {
    const pkg = require(packageJsonPath) as { version: string };
    return pkg.version;
  } catch {
    return 'unknown';
  }
}

export function createContext(options: TransformerOptions): Context {
  const mode = resolveMode(options.mode);
  const env = loadEnv({
    envDir: options.envDir ?? options.root ?? process.cwd(),
    envFile: options.envFile ?? Constants.DEFAULT_ENV_FILE,
    envPrefix: options.envPrefix ?? Constants.DEFAULT_ENV_PREFIX,
    mode,
  });
  const { enabled: canInstrument = false, ...instrumentOptions } =
    options.experimental?.customCoverageInstrumentation ?? {};
  const nativeRequire = createRequire(require.resolve('rollipop/package.json'));
  const optionsHash = createHash('sha1')
    .update(
      JSON.stringify({
        version: packageVersion('@rollipop/jest-preset/package.json'),
        nativeVersion: packageVersion(nativeRequire.resolve('@rollipop/rolldown/package.json')),
        cwd: process.cwd(),
        mode,
        env,
        options,
      }),
    )
    .digest('hex');

  return {
    options,
    mode,
    globals: {
      'import.meta.hot': 'undefined',
      'import.meta.env': JSON.stringify({}),
      // User envs
      ...defineEnvFromObject(env),
      // Built-in envs
      ...defineEnvFromObject({ MODE: mode }),
    },
    canInstrument,
    instrumentOptions,
    optionsHash,
    pipelines: new Map(),
  };
}

function getCoveragePlugin(context: Context) {
  return (context.coveragePlugin ??= {
    path: require.resolve('swc-plugin-coverage-instrument'),
    version: packageVersion('swc-plugin-coverage-instrument/package.json'),
  });
}

export function getPipeline(context: Context, jestOptions: TransformOptions = {}) {
  const esm = jestOptions.supportsStaticESM === true;
  const instrument = context.canInstrument && jestOptions.instrument === true;
  const key = Number(esm) * 2 + Number(instrument);
  let pipeline = context.pipelines.get(key);
  if (pipeline == null) {
    const swc: rolldownExperimental.RollipopReactNativeSwcConfig = {
      globals: {
        ...context.globals,
        'import.meta.glob': esm ? GLOB_IMPORT_HELPERS.esm : GLOB_IMPORT_HELPERS.cjs,
      },
      react: {
        development: context.mode === 'development',
        runtime: 'Automatic',
      },
      module: { type: esm ? 'unambiguous' : 'commonjs' },
      plugins: instrument
        ? [[getCoveragePlugin(context).path, context.instrumentOptions]]
        : undefined,
    };
    const config = {
      envName: context.mode,
      runtimeTarget: context.options.runtimeTarget,
      swc: { ...swc, jest: true },
      flow: context.options.flow,
      worklets: context.options.worklets,
    };
    pipeline = new rolldownExperimental.RollipopReactNativeTransformer(config);
    context.pipelines.set(key, pipeline);
  }
  return pipeline;
}

export function getCacheKey(
  context: Context,
  sourceText: string,
  sourcePath: string,
  jestOptions: TransformOptions = {},
): string {
  return createHash('sha1')
    .update(context.optionsHash)
    .update('\0')
    .update(
      JSON.stringify({
        configString: jestOptions.configString ?? '',
        instrument: jestOptions.instrument === true,
        supportsStaticESM: jestOptions.supportsStaticESM === true,
        coveragePluginVersion:
          context.canInstrument && jestOptions.instrument === true
            ? getCoveragePlugin(context).version
            : undefined,
      }),
    )
    .update('\0')
    .update(sourcePath)
    .update('\0')
    .update(sourceText)
    .digest('hex');
}
