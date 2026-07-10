import { describe, expect, it } from 'vite-plus/test';

import { EventBus } from '../../../events/event-bus';
import type { ReportableEvent } from '../../../types';
import { reporter } from '../reporter-plugin';

function createReporterPlugin(initialTotalModules?: number) {
  const events: ReportableEvent[] = [];
  const eventBus = new EventBus();
  eventBus.subscribe((event) => events.push(event));

  return {
    events,
    plugin: reporter({ eventBus, initialTotalModules })!,
  };
}

describe('reporter plugin', () => {
  it('counts cache hits as progress and reports final transform/cache counts', async () => {
    const { events, plugin } = createReporterPlugin();
    const buildStart = plugin.buildStart as unknown as () => void;
    const buildEnd = plugin.buildEnd as unknown as (error?: Error) => void;
    const transform = plugin.transform as unknown as {
      handler: (code: string, id: string) => void | Promise<void>;
    };
    const transformCacheHit = plugin.transformCacheHit as unknown as (
      id: string,
    ) => void | Promise<void>;

    buildStart();
    await transform.handler('', '/entry.ts');
    await transformCacheHit('/cached.ts');
    buildEnd();

    expect(events).toEqual([
      { type: 'bundle_build_started' },
      {
        type: 'transform',
        id: '/entry.ts',
        totalModules: undefined,
        transformedModules: 1,
      },
      {
        type: 'transform',
        id: '/cached.ts',
        totalModules: undefined,
        transformedModules: 2,
      },
      {
        type: 'bundle_build_done',
        totalModules: 2,
        transformedModules: 1,
        cacheHitModules: 1,
        duration: expect.any(Number),
      },
    ]);
  });

  it('uses the current rebuild total after a watch change', async () => {
    const { events, plugin } = createReporterPlugin(4722);
    const buildStart = plugin.buildStart as unknown as () => void;
    const buildEnd = plugin.buildEnd as unknown as (error?: Error) => void;
    const transform = plugin.transform as unknown as {
      handler: (code: string, id: string) => void | Promise<void>;
    };
    const watchChange = plugin.watchChange as unknown as (id: string) => void;

    watchChange('/App.tsx');
    buildStart();
    await transform.handler('', '/App.tsx');
    await transform.handler('', '/dep.ts');
    buildEnd();

    expect(events).toEqual([
      { type: 'watch_change', id: '/App.tsx' },
      { type: 'bundle_build_started' },
      {
        type: 'transform',
        id: '/App.tsx',
        totalModules: 4722,
        transformedModules: 1,
      },
      {
        type: 'transform',
        id: '/dep.ts',
        totalModules: 4722,
        transformedModules: 2,
      },
      {
        type: 'bundle_build_done',
        totalModules: 2,
        transformedModules: 2,
        cacheHitModules: 0,
        duration: expect.any(Number),
      },
    ]);
  });

  it('counts cache hits in watch rebuild progress', async () => {
    const { events, plugin } = createReporterPlugin(1255);
    const buildStart = plugin.buildStart as unknown as () => void;
    const buildEnd = plugin.buildEnd as unknown as (error?: Error) => void;
    const transform = plugin.transform as unknown as {
      handler: (code: string, id: string) => void | Promise<void>;
    };
    const transformCacheHit = plugin.transformCacheHit as unknown as (
      id: string,
    ) => void | Promise<void>;
    const watchChange = plugin.watchChange as unknown as (id: string) => void;

    watchChange('/App.tsx');
    buildStart();
    await transformCacheHit('/cached.ts');
    await transform.handler('', '/App.tsx');
    buildEnd();

    expect(events).toEqual([
      { type: 'watch_change', id: '/App.tsx' },
      { type: 'bundle_build_started' },
      {
        type: 'transform',
        id: '/cached.ts',
        totalModules: 1255,
        transformedModules: 1,
      },
      {
        type: 'transform',
        id: '/App.tsx',
        totalModules: 1255,
        transformedModules: 2,
      },
      {
        type: 'bundle_build_done',
        totalModules: 2,
        transformedModules: 1,
        cacheHitModules: 1,
        duration: expect.any(Number),
      },
    ]);
  });

  it('resets progress for hmr transforms that run without a rebuild', async () => {
    const { events, plugin } = createReporterPlugin(1278);
    const buildStart = plugin.buildStart as unknown as () => void;
    const buildEnd = plugin.buildEnd as unknown as (error?: Error) => void;
    const transform = plugin.transform as unknown as {
      handler: (code: string, id: string) => void | Promise<void>;
    };
    const watchChange = plugin.watchChange as unknown as (id: string) => void;

    buildStart();
    await transform.handler('', '/entry.ts');
    buildEnd();

    events.length = 0;
    watchChange('/App.tsx');
    await transform.handler('', '/App.tsx');

    expect(events).toEqual([
      { type: 'watch_change', id: '/App.tsx' },
      {
        type: 'transform',
        id: '/App.tsx',
        totalModules: 1,
        transformedModules: 1,
      },
    ]);
  });

  it('resets progress for consecutive hmr transforms', async () => {
    const { events, plugin } = createReporterPlugin(1278);
    const buildStart = plugin.buildStart as unknown as () => void;
    const buildEnd = plugin.buildEnd as unknown as (error?: Error) => void;
    const transform = plugin.transform as unknown as {
      handler: (code: string, id: string) => void | Promise<void>;
    };
    const watchChange = plugin.watchChange as unknown as (id: string) => void;

    buildStart();
    await transform.handler('', '/entry.ts');
    buildEnd();

    events.length = 0;
    watchChange('/App.tsx');
    await transform.handler('', '/App.tsx');
    watchChange('/App.tsx');
    await transform.handler('', '/App.tsx');

    expect(events).toEqual([
      { type: 'watch_change', id: '/App.tsx' },
      {
        type: 'transform',
        id: '/App.tsx',
        totalModules: 1,
        transformedModules: 1,
      },
      { type: 'watch_change', id: '/App.tsx' },
      {
        type: 'transform',
        id: '/App.tsx',
        totalModules: 1,
        transformedModules: 1,
      },
    ]);
  });
});
