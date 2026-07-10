import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { ProgressBarStatusReporter } from '../builtin-reporters';

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

describe('ProgressBarStatusReporter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders watch rebuild progress using the current build total', async () => {
    const writes: string[] = [];
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk: Uint8Array | string) => {
      writes.push(String(chunk));
      return true;
    });
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const reporter = new ProgressBarStatusReporter(
      '/',
      'test-rebuild-progress',
      '[ios, dev]',
      4722,
    );

    try {
      reporter.update({ type: 'watch_change', id: '/App.tsx' });
      reporter.update({ type: 'bundle_build_started' });
      reporter.update({
        type: 'transform',
        id: '/App.tsx',
        totalModules: 4722,
        transformedModules: 1,
      });
      await sleep(80);

      const output = writes.join('');
      expect(output).toContain('0/4722 modules');
      expect(output).toContain('1/4722 modules');
      expect(output).not.toContain('1/1 modules');
    } finally {
      reporter.update({
        type: 'bundle_build_done',
        totalModules: 1,
        transformedModules: 1,
        cacheHitModules: 0,
        duration: 1,
      });
    }
  });

  it('renders the first rebuild progress update immediately after the total is known', () => {
    const writes: string[] = [];
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk: Uint8Array | string) => {
      writes.push(String(chunk));
      return true;
    });
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const reporter = new ProgressBarStatusReporter('/', 'test-immediate-rebuild', '[ios, dev]', 0);

    reporter.update({ type: 'bundle_build_started' });
    reporter.update({
      type: 'transform',
      id: '/entry.ts',
      totalModules: undefined,
      transformedModules: 1,
    });
    reporter.update({
      type: 'transform',
      id: '/dep.ts',
      totalModules: undefined,
      transformedModules: 2,
    });
    reporter.update({
      type: 'bundle_build_done',
      totalModules: 2,
      transformedModules: 2,
      cacheHitModules: 0,
      duration: 1,
    });

    writes.length = 0;
    reporter.update({ type: 'watch_change', id: '/entry.ts' });
    reporter.update({ type: 'bundle_build_started' });
    reporter.update({
      type: 'transform',
      id: '/entry.ts',
      totalModules: 2,
      transformedModules: 1,
    });

    try {
      const output = writes.join('');
      expect(output).toContain('0/2 modules');
      expect(output).toContain('1/2 modules');
    } finally {
      reporter.update({
        type: 'bundle_build_done',
        totalModules: 2,
        transformedModules: 1,
        cacheHitModules: 0,
        duration: 1,
      });
    }
  });

  it('renders build progress using the previous total', async () => {
    const writes: string[] = [];
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk: Uint8Array | string) => {
      writes.push(String(chunk));
      return true;
    });
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const reporter = new ProgressBarStatusReporter('/', 'test-build-progress', '[ios, dev]', 1278);

    try {
      reporter.update({ type: 'bundle_build_started' });
      reporter.update({
        type: 'transform',
        id: '/App.tsx',
        totalModules: 1278,
        transformedModules: 1,
      });
      await sleep(80);

      const output = writes.join('');
      expect(output).toContain('1/1278 modules');
      expect(output).not.toContain('1/1 modules');
    } finally {
      reporter.update({
        type: 'bundle_build_done',
        totalModules: 1,
        transformedModules: 1,
        cacheHitModules: 0,
        duration: 1,
      });
    }
  });

  it('renders hmr_updates completion without reusing the completed build count', async () => {
    const writes: string[] = [];
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk: Uint8Array | string) => {
      writes.push(String(chunk));
      return true;
    });
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const reporter = new ProgressBarStatusReporter('/', 'test-hmr-transform', '[ios, dev]', 1278);

    reporter.update({ type: 'bundle_build_started' });
    reporter.update({
      type: 'bundle_build_done',
      totalModules: 1278,
      transformedModules: 1278,
      cacheHitModules: 0,
      duration: 790,
    });
    await sleep(80);
    writes.length = 0;

    reporter.update({ type: 'watch_change', id: '/App.tsx' });
    reporter.update({
      type: 'transform',
      id: '/App.tsx',
      totalModules: 1,
      transformedModules: 1,
    });
    reporter.update({
      type: 'hmr_updates',
      bundlerId: 'test-hmr-transform',
      updates: [],
      changedFiles: ['/App.tsx'],
    });
    await sleep(80);

    const output = writes.join('');
    expect(output).toContain('HMR Updated');
    expect(output).toContain('[ios, dev]');
    expect(output).toContain('(x1)');
    expect(output).toContain('App.tsx');
    expect(output).not.toContain('\n  /App.tsx');
    expect(output).toContain('1/1 modules');
    expect(output).not.toContain('Build completed');
    expect(output).not.toContain('1279/1279 modules');
    expect(output).not.toContain('1278/1278 modules');
  });

  it('reports consecutive hmr_updates for the same file without another transform', async () => {
    const writes: string[] = [];
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk: Uint8Array | string) => {
      writes.push(String(chunk));
      return true;
    });
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const reporter = new ProgressBarStatusReporter('/', 'test-consecutive-hmr', '[ios, dev]', 1278);

    reporter.update({ type: 'bundle_build_started' });
    reporter.update({
      type: 'bundle_build_done',
      totalModules: 1278,
      transformedModules: 1278,
      cacheHitModules: 0,
      duration: 790,
    });
    await sleep(80);
    writes.length = 0;

    reporter.update({ type: 'watch_change', id: '/App.tsx' });
    reporter.update({
      type: 'transform',
      id: '/App.tsx',
      totalModules: 1,
      transformedModules: 1,
    });
    reporter.update({
      type: 'hmr_updates',
      bundlerId: 'test-consecutive-hmr',
      updates: [],
      changedFiles: ['/App.tsx'],
    });
    await sleep(80);

    const firstOutput = writes.join('');
    expect(firstOutput).toContain('HMR Updated');
    expect(firstOutput).toContain('(x1)');
    expect(firstOutput).toContain('App.tsx');

    writes.length = 0;
    reporter.update({ type: 'watch_change', id: '/App.tsx' });
    reporter.update({
      type: 'hmr_updates',
      bundlerId: 'test-consecutive-hmr',
      updates: [],
      changedFiles: ['/App.tsx'],
    });
    await sleep(80);

    const secondOutput = writes.join('');
    expect(secondOutput).toContain('HMR Updated');
    expect(secondOutput).toContain('(x2)');
    expect(secondOutput).toContain('App.tsx');
  });

  it('finishes incremental progress when hmr_failed is reported', async () => {
    const writes: string[] = [];
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk: Uint8Array | string) => {
      writes.push(String(chunk));
      return true;
    });
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const reporter = new ProgressBarStatusReporter('/', 'test-hmr-failed', '[ios, dev]', 1278);

    reporter.update({ type: 'watch_change', id: '/App.tsx' });
    reporter.update({
      type: 'transform',
      id: '/App.tsx',
      totalModules: 1,
      transformedModules: 1,
    });
    reporter.update({ type: 'hmr_failed', error: new Error('Invalid patch') });
    await sleep(80);

    const output = writes.join('');
    expect(output).toContain('HMR failed');
    expect(output).not.toContain('HMR Updated');
  });

  it('keeps the last full build total after hmr progress', async () => {
    const writes: string[] = [];
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk: Uint8Array | string) => {
      writes.push(String(chunk));
      return true;
    });
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const reporter = new ProgressBarStatusReporter(
      '/',
      'test-rebuild-after-hmr',
      '[ios, dev]',
      1255,
    );

    reporter.update({ type: 'bundle_build_started' });
    reporter.update({
      type: 'bundle_build_done',
      totalModules: 1255,
      transformedModules: 1255,
      cacheHitModules: 0,
      duration: 790,
    });

    reporter.update({ type: 'watch_change', id: '/App.tsx' });
    reporter.update({
      type: 'transform',
      id: '/App.tsx',
      totalModules: 1,
      transformedModules: 1,
    });
    reporter.update({
      type: 'hmr_updates',
      bundlerId: 'test-rebuild-after-hmr',
      updates: [],
      changedFiles: ['/App.tsx'],
    });
    await sleep(80);

    writes.length = 0;
    reporter.update({ type: 'watch_change', id: '/App.tsx' });
    reporter.update({ type: 'bundle_build_started' });
    await sleep(80);

    const output = writes.join('');
    expect(output).toContain('0/1255 modules');
    expect(output).not.toContain('0/1 modules');

    reporter.update({
      type: 'bundle_build_done',
      totalModules: 1255,
      transformedModules: 0,
      cacheHitModules: 0,
      duration: 130,
    });
  });

  it('renders completion using the final transformed module count', () => {
    const writes: string[] = [];
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk: Uint8Array | string) => {
      writes.push(String(chunk));
      return true;
    });
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const reporter = new ProgressBarStatusReporter('/', 'test-hmr-complete', '[ios, dev]', 1278);

    reporter.update({ type: 'bundle_build_started' });
    reporter.update({
      type: 'bundle_build_done',
      totalModules: 1,
      transformedModules: 1,
      cacheHitModules: 0,
      duration: 790,
    });

    const output = writes.join('');
    expect(output).toContain('1/1 modules');
    expect(output).not.toContain('1278/1278 modules');
  });

  it('renders completion as total when a reload reuses the previous build output', () => {
    const writes: string[] = [];
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk: Uint8Array | string) => {
      writes.push(String(chunk));
      return true;
    });
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const reporter = new ProgressBarStatusReporter('/', 'test-reload-complete', '[ios, dev]', 1582);

    reporter.update({ type: 'bundle_build_started' });
    reporter.update({
      type: 'bundle_build_done',
      totalModules: 1582,
      transformedModules: 0,
      cacheHitModules: 0,
      duration: 0,
    });

    const output = writes.join('');
    expect(output).toContain('1582/1582 modules');
    expect(output).not.toContain('0/1582 modules');
  });

  it('renders completion using transformed and cache-hit modules', () => {
    const writes: string[] = [];
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk: Uint8Array | string) => {
      writes.push(String(chunk));
      return true;
    });
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const reporter = new ProgressBarStatusReporter(
      '/',
      'test-cache-hit-complete',
      '[ios, dev]',
      10,
    );

    reporter.update({ type: 'bundle_build_started' });
    reporter.update({
      type: 'bundle_build_done',
      totalModules: 10,
      transformedModules: 1,
      cacheHitModules: 9,
      duration: 10,
    });

    const output = writes.join('');
    expect(output).toContain('10/10 modules');
    expect(output).not.toContain('1/10 modules');
  });
});
