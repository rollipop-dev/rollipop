import * as swc from '@swc/core';
import transform, { type SourceMapLike, type TransformResult } from 'fast-flow-transform';

export async function stripFlowTypes(id: string, code: string): Promise<TransformResult> {
  try {
    return await transform({
      filename: id,
      source: code,
      sourcemap: true,
      dialect: 'flow',
      format: 'pretty',
    });
  } catch {
    const result = swc.transformSync(code, {
      filename: id,
      configFile: false,
      swcrc: false,
      sourceMaps: true,
      inputSourceMap: false,
      jsc: {
        target: 'esnext',
        parser: {
          syntax: 'flow',
          all: true,
          jsx: true,
          enums: true,
          components: true,
          patternMatching: true,
        },
        minify: { format: { comments: false } },
      },
    });

    return {
      code: result.code,
      map: result.map ? (JSON.parse(result.map) as SourceMapLike) : undefined,
    };
  }
}
