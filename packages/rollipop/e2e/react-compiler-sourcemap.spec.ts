import { describe, expect, it, vi } from 'vite-plus/test';

import { evaluateContext } from '../src/testing/evaluate-context';
import { build, type TestConfigOptions } from './helpers';
import { buildWithReactRefresh, expectMappedError } from './sourcemap-helpers';

describe.each([
  { name: 'development', mode: 'development', minify: false, compiler: true, refresh: false },
  { name: 'minified production', mode: 'production', minify: true, compiler: true, refresh: false },
  { name: 'React Refresh', mode: 'development', minify: false, compiler: false, refresh: true },
  {
    name: 'React Refresh + Compiler',
    mode: 'development',
    minify: false,
    compiler: true,
    refresh: true,
  },
] as const)('React sourcemaps with $name', ({ mode, minify, compiler, refresh }) => {
  it.each([
    {
      component: 'ThrowingComponent',
      message: 'component failure',
      source: 'index.tsx',
      cacheCalls: 1,
    },
    {
      component: 'ComponentWithHook',
      message: 'hook failure',
      source: 'use-throwing-hook.ts',
      cacheCalls: 2,
    },
    {
      component: 'ComponentWithMemo',
      message: 'memo failure',
      source: 'index.tsx',
      cacheCalls: 1,
    },
  ])(
    'maps a throw in $component to its original location',
    async ({ component, message, source, cacheCalls }) => {
      const fixture = 'transformer/react-compiler-sourcemap';
      const runtimeModules: Record<string, string> = {
        'react/compiler-runtime': 'export const c = (size) => globalThis.createMemoCache(size);',
        react: 'export const useMemo = (compute) => compute();',
        'react/jsx-runtime': 'export const jsx = () => null;',
        'react/jsx-dev-runtime': 'export const jsxDEV = () => null;',
      };
      const runtimePrefix = '\0test:react-runtime/';
      const options: TestConfigOptions = {
        entry: 'index.tsx',
        mode,
        transform: { jsx: { compiler: compiler ? {} : undefined } },
        plugins: [
          {
            name: 'test:react-runtime',
            resolveId(id) {
              if (Object.hasOwn(runtimeModules, id)) {
                return runtimePrefix + id;
              }
            },
            load(id) {
              if (id.startsWith(runtimePrefix)) {
                return runtimeModules[id.slice(runtimePrefix.length)];
              }
            },
          },
        ],
      };
      const chunk = refresh
        ? await buildWithReactRefresh(fixture, options)
        : await build(fixture, options, { dev: mode === 'development', minify, sourcemap: true });

      expect(chunk.map).toBeDefined();
      expect(Object.keys(chunk.modules).includes(runtimePrefix + 'react/compiler-runtime')).toBe(
        compiler,
      );

      // Supply a fresh render's cache; the bundled component/hook code runs unchanged.
      const memoCache = vi.fn((size: number) =>
        Array(size).fill(Symbol.for('react.memo_cache_sentinel')),
      );
      const register = vi.fn();
      const createSignature = vi.fn(() => (type: unknown) => type);
      const context = evaluateContext({
        createMemoCache: memoCache,
        __ReactRefresh: { register, createSignatureFunctionForTransform: createSignature },
      });
      await expectMappedError(chunk, { fixture, source, message }, () =>
        context.evaluate(
          `${chunk.code}\nglobalThis.testComponents.${component}({ shouldThrow: true, value: 'test' });`,
        ),
      );
      expect(memoCache).toHaveBeenCalledTimes(compiler ? cacheCalls : 0);
      if (refresh) {
        expect(register).toHaveBeenCalledWith(
          expect.any(Function),
          expect.stringContaining('ThrowingComponent'),
        );
        expect(createSignature).toHaveBeenCalled();
        expect(context.evaluate('globalThis.__rollipop_runtime__.graphs.size')).toBe(1);
      } else {
        expect(register).not.toHaveBeenCalled();
        expect(createSignature).not.toHaveBeenCalled();
      }
    },
  );
});
