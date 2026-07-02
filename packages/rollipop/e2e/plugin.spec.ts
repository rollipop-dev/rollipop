import { describe, expect, it } from 'vite-plus/test';

import type { ResolvedConfig } from '../src/config/defaults';
import {
  flattenPluginOption,
  invokeConfigResolved,
  resolvePluginConfig,
} from '../src/config/load-config';
import type { Plugin } from '../src/core/plugins/types';
import type { ReportableEvent } from '../src/types';
import { resetCache } from '../src/utils/reset-cache';
import { build, createConfig } from './helpers';

describe('plugin system', () => {
  describe('rolldown hooks', () => {
    it('resolveId + load: provides virtual modules', async () => {
      const VIRTUAL_PREFIX = '\0virtual:';

      const plugin: Plugin = {
        name: 'test:virtual-modules',
        resolveId(source) {
          if (source === 'virtual:config') return VIRTUAL_PREFIX + 'config';
          if (source === 'virtual:version') return VIRTUAL_PREFIX + 'version';
        },
        load(id) {
          if (id === VIRTUAL_PREFIX + 'config') {
            return 'export default { apiUrl: "https://api.test.com" };';
          }
          if (id === VIRTUAL_PREFIX + 'version') {
            return 'export const version = "2.0.0";';
          }
        },
      };

      const chunk = await build('plugin/virtual', { plugins: [plugin] });

      expect(chunk.code).toContain('https://api.test.com');
      expect(chunk.code).toContain('2.0.0');
    });

    it('transform: modifies source code during build', async () => {
      const plugin: Plugin = {
        name: 'test:transform',
        transform(code, id) {
          if (id.endsWith('index.ts')) {
            return { code: code.replace("'main entry'", "'TRANSFORMED'") };
          }
        },
      };

      const chunk = await build('serializer/prelude', { plugins: [plugin] });

      expect(chunk.code).toContain('TRANSFORMED');
      expect(chunk.code).not.toContain('main entry');
    });

    it('transform with filter: only processes matching files', async () => {
      const transformedIds: string[] = [];

      const plugin: Plugin = {
        name: 'test:filtered-transform',
        transform: {
          filter: { id: /\.ts$/ },
          handler(_code, id) {
            transformedIds.push(id);
          },
        },
      };

      await build('serializer/prelude', { plugins: [plugin] });

      expect(transformedIds.length).toBeGreaterThan(0);
      expect(transformedIds.every((id) => id.endsWith('.ts'))).toBe(true);
    });

    it('buildStart is called before bundling begins', async () => {
      let buildStartCalled = false;
      let buildStartBeforeTransform = false;
      let transformCalled = false;

      const plugin: Plugin = {
        name: 'test:lifecycle',
        buildStart() {
          buildStartCalled = true;
          buildStartBeforeTransform = !transformCalled;
        },
        transform() {
          transformCalled = true;
        },
      };

      await build('serializer/prelude', { plugins: [plugin] });

      expect(buildStartCalled).toBe(true);
      expect(buildStartBeforeTransform).toBe(true);
    });

    it('buildEnd is called after bundling completes (with no error on success)', async () => {
      let receivedError: unknown = 'not-called';

      const plugin: Plugin = {
        name: 'test:build-end',
        buildEnd(error) {
          receivedError = error;
        },
      };

      await build('serializer/prelude', { plugins: [plugin] });

      expect(receivedError).toBeUndefined();
    });

    it('buildEnd receives error on build failure', async () => {
      let buildEndCalled = false;

      const plugin: Plugin = {
        name: 'test:build-end-error',
        transform() {
          throw new Error('forced-transform-error');
        },
        buildEnd() {
          buildEndCalled = true;
        },
      };

      try {
        await build('serializer/prelude', { plugins: [plugin] });
      } catch {
        // expected — build should fail due to forced error
      }

      expect(buildEndCalled).toBe(true);
    });

    it('reports persistent transform cache hits as progress', async () => {
      const collectEvents = (events: ReportableEvent[]) => ({
        update(event: ReportableEvent) {
          events.push(event);
        },
      });
      const getDoneEvent = (events: ReportableEvent[]) => {
        const event = events.findLast((event) => event.type === 'bundle_build_done');
        if (event?.type !== 'bundle_build_done') {
          throw new Error('bundle_build_done event was not emitted');
        }
        return event;
      };

      await resetCache();
      try {
        const firstEvents: ReportableEvent[] = [];
        await build(
          'serializer/prelude',
          { reporter: collectEvents(firstEvents) },
          { cache: true },
        );

        const secondEvents: ReportableEvent[] = [];
        await build(
          'serializer/prelude',
          { reporter: collectEvents(secondEvents) },
          { cache: true },
        );

        const doneEvent = getDoneEvent(secondEvents);
        const progressEvent = secondEvents.findLast((event) => event.type === 'transform');

        expect(doneEvent.cacheHitModules).toBeGreaterThan(0);
        expect(doneEvent.totalModules).toBe(
          doneEvent.transformedModules + doneEvent.cacheHitModules,
        );
        expect(progressEvent?.type).toBe('transform');
        expect(progressEvent?.transformedModules).toBe(doneEvent.totalModules);
      } finally {
        await resetCache();
      }
    });
  });

  describe('plugin execution order', () => {
    it('plugins execute in array order', async () => {
      const order: string[] = [];

      const pluginA: Plugin = {
        name: 'test:order-a',
        buildStart() {
          order.push('a');
        },
      };

      const pluginB: Plugin = {
        name: 'test:order-b',
        buildStart() {
          order.push('b');
        },
      };

      const pluginC: Plugin = {
        name: 'test:order-c',
        buildStart() {
          order.push('c');
        },
      };

      await build('serializer/prelude', { plugins: [pluginA, pluginB, pluginC] });

      expect(order).toEqual(['a', 'b', 'c']);
    });

    it('transform with order:"pre" runs before normal transforms', async () => {
      const order: string[] = [];

      const normalPlugin: Plugin = {
        name: 'test:normal',
        transform(code, id) {
          if (id.endsWith('index.ts')) order.push('normal');
        },
      };

      const prePlugin: Plugin = {
        name: 'test:pre',
        transform: {
          order: 'pre',
          handler(code, id) {
            if (id.endsWith('index.ts')) order.push('pre');
          },
        },
      };

      // Even though normalPlugin is listed first, prePlugin should run first
      await build('serializer/prelude', { plugins: [normalPlugin, prePlugin] });

      const preIdx = order.indexOf('pre');
      const normalIdx = order.indexOf('normal');
      expect(preIdx).toBeLessThan(normalIdx);
    });
  });

  describe('rollipop-specific hooks', () => {
    it('config hook modifies bundler configuration', async () => {
      const plugin: Plugin = {
        name: 'test:config-hook',
        config(config) {
          return {
            ...config,
            serializer: {
              ...config.serializer,
              banner: '/* INJECTED_BY_CONFIG_HOOK */',
            },
          };
        },
      };

      // Test through resolvePluginConfig (config hooks are processed during config loading)
      const baseConfig = {};
      const result = await resolvePluginConfig(baseConfig, [plugin]);

      expect(result.serializer?.banner).toBe('/* INJECTED_BY_CONFIG_HOOK */');
    });

    it('config hook as object is merged into config', async () => {
      const plugin: Plugin = {
        name: 'test:config-object',
        config: {
          optimization: { treeshake: false },
          serializer: { banner: '/* FROM_OBJECT */' },
        },
      };

      const baseConfig = { optimization: { treeshake: true } };
      const result = await resolvePluginConfig(baseConfig as any, [plugin]);

      expect(result.optimization?.treeshake).toBe(false);
      expect(result.serializer?.banner).toBe('/* FROM_OBJECT */');
    });

    it('multiple config hooks are applied sequentially', async () => {
      const pluginA: Plugin = {
        name: 'test:config-a',
        config: {
          serializer: { banner: '/* A */' },
        },
      };

      const pluginB: Plugin = {
        name: 'test:config-b',
        config(config) {
          // Should receive config already merged with plugin A
          return {
            ...config,
            serializer: {
              ...config.serializer,
              footer: '/* B */',
            },
          };
        },
      };

      const result = await resolvePluginConfig({}, [pluginA, pluginB]);

      expect(result.serializer?.banner).toBe('/* A */');
      expect(result.serializer?.footer).toBe('/* B */');
    });

    it('configResolved receives the final merged configuration', async () => {
      let receivedConfig: ResolvedConfig | undefined;

      const plugin: Plugin = {
        name: 'test:config-resolved',
        configResolved(config) {
          receivedConfig = config;
        },
      };

      const config = createConfig('serializer/prelude', { plugins: [plugin] });
      await invokeConfigResolved(config, [plugin]);

      expect(receivedConfig).toBeDefined();
      expect(receivedConfig!.root).toBe(config.root);
      expect(receivedConfig!.mode).toBe(config.mode);
      expect(receivedConfig!.entry).toBe(config.entry);
    });

    it('configResolved is called for all plugins in parallel', async () => {
      const callTimes: number[] = [];

      const makePlugin = (name: string): Plugin => ({
        name,
        async configResolved() {
          callTimes.push(Date.now());
          // Small delay to verify parallel execution
          await new Promise((r) => setTimeout(r, 10));
        },
      });

      const plugins = [makePlugin('a'), makePlugin('b'), makePlugin('c')];
      const config = createConfig('serializer/prelude', { plugins });

      await invokeConfigResolved(config, plugins);

      expect(callTimes).toHaveLength(3);
      // All should start at roughly the same time (parallel execution)
      const maxDiff = Math.max(...callTimes) - Math.min(...callTimes);
      expect(maxDiff).toBeLessThan(50);
    });

    it('config hook returning null does not modify config', async () => {
      const plugin: Plugin = {
        name: 'test:config-null',
        config() {
          return null;
        },
      };

      const baseConfig = { entry: 'original.ts' };
      const result = await resolvePluginConfig(baseConfig, [plugin]);

      expect(result.entry).toBe('original.ts');
    });
  });

  describe('plugin option flattening', () => {
    it('filters out null and false plugins', async () => {
      const plugins = await flattenPluginOption([{ name: 'real-plugin' }, null, false, undefined]);

      expect(plugins).toHaveLength(1);
      expect(plugins[0].name).toBe('real-plugin');
    });

    it('flattens nested plugin arrays', async () => {
      const plugins = await flattenPluginOption([{ name: 'a' }, [{ name: 'b' }, [{ name: 'c' }]]]);

      expect(plugins.map((p) => p.name)).toEqual(['a', 'b', 'c']);
    });

    it('resolves promised plugins', async () => {
      const plugins = await flattenPluginOption([
        Promise.resolve({ name: 'async-plugin' }),
        Promise.resolve(null),
      ]);

      expect(plugins).toHaveLength(1);
      expect(plugins[0].name).toBe('async-plugin');
    });

    it('does not expose internal-only hooks on the public plugin type', () => {
      const plugin: Plugin = {
        name: 'test:public-plugin-type',
        // @ts-expect-error transformCacheHit is reserved for Rollipop internals.
        transformCacheHit() {},
      };

      expect(plugin.name).toBe('test:public-plugin-type');
    });

    it('removes internal-only hooks from user plugins', async () => {
      let transformCacheHitCalled = false;
      const plugins = await flattenPluginOption({
        name: 'test:internal-hook',
        transformCacheHit() {
          transformCacheHitCalled = true;
        },
      } as unknown as Plugin);

      expect('transformCacheHit' in plugins[0]).toBe(false);
      expect(transformCacheHitCalled).toBe(false);
    });
  });
});
