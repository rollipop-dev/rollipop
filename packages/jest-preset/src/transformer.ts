import type { rolldownExperimental } from 'rollipop';

import { createContext, getCacheKey, getPipeline, type TransformOptions } from './utils';

export interface TransformerOptions {
  mode?: 'development' | 'production';
  root?: string;
  runtimeTarget?: rolldownExperimental.RollipopReactNativeRuntimeTarget;
  flow?: rolldownExperimental.RollipopReactNativeFlowConfig;
  worklets?: rolldownExperimental.RollipopReactNativeWorkletsConfig;
  envDir?: string;
  envFile?: string;
  envPrefix?: string;
  experimental?: ExperimentalOptions;
}

export interface ExperimentalOptions {
  /** Native SWC coverage instrumentation, using the same options as `@swc/jest`. */
  customCoverageInstrumentation?: CustomCoverageInstrumentationOptions;
}

export interface CustomCoverageInstrumentationOptions {
  /** Instrument only when Jest requests coverage. Defaults to `false`. */
  enabled: boolean;
  coverageVariable?: string;
  compact?: boolean;
  reportLogic?: boolean;
  ignoreClassMethods?: string[];
  instrumentLog?: { level: string; enableTrace: boolean };
}

interface JestTransformOutput {
  code: string;
  map?: string;
}

interface JestSyncTransformer {
  canInstrument: boolean;
  process(sourceText: string, sourcePath: string, options?: TransformOptions): JestTransformOutput;
  processAsync(
    sourceText: string,
    sourcePath: string,
    options?: TransformOptions,
  ): Promise<JestTransformOutput>;
  getCacheKey(sourceText: string, sourcePath: string, options?: TransformOptions): string;
}

export function createTransformer(options: TransformerOptions = {}): JestSyncTransformer {
  const context = createContext(options);
  return {
    canInstrument: context.canInstrument,
    process(sourceText, sourcePath, jestOptions): JestTransformOutput {
      const result = getPipeline(context, jestOptions).transformSync(sourcePath, sourceText);
      return { code: result.code, ...(result.map != null ? { map: result.map } : null) };
    },
    async processAsync(sourceText, sourcePath, jestOptions): Promise<JestTransformOutput> {
      const result = await getPipeline(context, jestOptions).transform(sourcePath, sourceText);
      return { code: result.code, ...(result.map != null ? { map: result.map } : null) };
    },
    getCacheKey(sourceText, sourcePath, jestOptions): string {
      return getCacheKey(context, sourceText, sourcePath, jestOptions);
    },
  };
}
