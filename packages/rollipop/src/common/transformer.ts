import * as babel from '@babel/core';
import { invariant } from 'es-toolkit';
import transform from 'fast-flow-transform';

export async function stripFlowTypes(id: string, code: string) {
  try {
    return await transform({
      filename: id,
      source: code,
      sourcemap: true,
      dialect: 'flow',
      format: 'pretty',
    });
  } catch {
    const result = babel.transformSync(code, {
      filename: id,
      babelrc: false,
      configFile: false,
      comments: false,
      sourceFileName: id,
      sourceMaps: true,
      parserOpts: { flow: 'all', reactRuntimeTarget: '19' } as any,
      plugins: [
        [
          require.resolve('babel-plugin-syntax-hermes-parser'),
          {
            parseLangTypes: 'flow',
          },
        ],
        require.resolve('@babel/plugin-transform-flow-strip-types'),
      ],
    });
    invariant(result && result.code != null, `Failed to strip Flow types with Babel: ${id}`);

    const map = result.map && {
      version: result.map.version,
      file: result.map.file ?? id,
      sourceRoot: result.map.sourceRoot ?? undefined,
      names: [...result.map.names],
      sources: result.map.sources.map((source) => source ?? id),
      sourcesContent: result.map.sourcesContent
        ? result.map.sourcesContent.map((source) => source ?? code)
        : undefined,
      mappings: result.map.mappings,
    };
    return { code: result.code, map };
  }
}
