import type * as rolldown from '@rollipop/rolldown';
import { interpreter } from '@rollipop/rolldown/filter';
import { describe, expect, it } from 'vite-plus/test';

import { ROLLIPOP_VIRTUAL_BOOTSTRAP_ID } from '../../../constants';
import { evaluateContext } from '../../../testing/evaluate-context';
import { devServer } from '../dev-server-plugin';

type Filter = Parameters<typeof interpreter>[0];

describe('dev server plugin', () => {
  it('rewrites output chunk sourceMappingURL during generateBundle', async () => {
    const plugins = await devServer({
      cwd: '/root/project',
      id: 'test-bundler',
      platform: 'ios',
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

  it('registers the bundle-local HMR graph from the bootstrap module', async () => {
    const hmr = {
      id: 'remote_app',
      origin: 'http://localhost:8082',
      bundleEntry: 'remote.bundle',
      platform: 'ios',
    };
    const plugins = await devServer({
      cwd: '/root/project',
      ...hmr,
      hmrClientPath: 'rollipop/hmr-client',
      hmrConfig: { runtimeImplement: '', clientImplement: '' },
    });
    const plugin = plugins?.find((plugin) => plugin.name === 'rollipop:register-hmr-graph');
    const transform = plugin?.transform as {
      filter: Filter;
      handler: (code: string) => string;
    };
    const graphRuntime = {};
    const registeredGraphs: unknown[] = [];

    expect(interpreter(transform.filter, undefined, ROLLIPOP_VIRTUAL_BOOTSTRAP_ID)).toBe(true);
    const code = transform.handler('initializeMetadata();');
    evaluateContext({
      __hot__: { runtime: graphRuntime },
      __rollipop_runtime__: {
        registerGraph(graph: unknown) {
          registeredGraphs.push(graph);
        },
      },
      initializeMetadata() {},
    }).evaluate(code.replaceAll('import.meta.hot', '__hot__'));

    expect(registeredGraphs).toEqual([{ ...hmr, runtime: graphRuntime }]);
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
