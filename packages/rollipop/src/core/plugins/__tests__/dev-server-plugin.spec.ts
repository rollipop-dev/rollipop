import type * as rolldown from '@rollipop/rolldown';
import { describe, expect, it } from 'vite-plus/test';

import { devServer } from '../dev-server-plugin';

describe('dev server plugin', () => {
  it('rewrites output chunk sourceMappingURL during generateBundle', async () => {
    const plugins = await devServer({
      cwd: '/root/project',
      hmrClientPath: 'rollipop/hmr-client',
      hmrConfig: null,
      sourceMapUrl: 'http://localhost:8081/index.map?platform=ios&dev=true&minify=false',
    });
    const plugin = plugins?.find((plugin) => plugin.name === 'rollipop:dev-server-source-map-url');
    expect(plugin).toBeDefined();

    const bundle = {
      'index.bundle': {
        type: 'chunk',
        fileName: 'index.bundle',
        code: 'console.log("ok");\n//# sourceMappingURL=index.map\n',
        map: {
          toString: () => '{"version":3,"sources":[],"mappings":""}',
        },
      },
    } as unknown as rolldown.OutputBundle;

    await callGenerateBundle(plugin!, {}, bundle);

    expect((bundle['index.bundle'] as rolldown.OutputChunk).code).toBe(
      'console.log("ok");\n' +
        '//# sourceMappingURL=http://localhost:8081/index.map?platform=ios&dev=true&minify=false',
    );
  });
});

async function callGenerateBundle(
  plugin: rolldown.Plugin,
  outputOptions: rolldown.NormalizedOutputOptions | Record<string, never>,
  bundle: rolldown.OutputBundle,
) {
  const hook = plugin.generateBundle as
    | ((
        this: rolldown.PluginContext,
        outputOptions: rolldown.NormalizedOutputOptions | Record<string, never>,
        bundle: rolldown.OutputBundle,
        isWrite: boolean,
      ) => void | Promise<void>)
    | {
        handler: (
          this: rolldown.PluginContext,
          outputOptions: rolldown.NormalizedOutputOptions | Record<string, never>,
          bundle: rolldown.OutputBundle,
          isWrite: boolean,
        ) => void | Promise<void>;
      };

  const handler = typeof hook === 'function' ? hook : hook.handler;
  await handler.call({} as rolldown.PluginContext, outputOptions, bundle, false);
}
