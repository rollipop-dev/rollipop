import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  EXPO_BUNDLER_ENV,
  getExpoRouterAppRoot,
  isExpoBundlerMode,
  translateExpoMetroConfig,
} from './config-translator';

describe('translateExpoMetroConfig', () => {
  it('maps resolver.alias to resolve.alias', () => {
    const { config: result } = translateExpoMetroConfig({
      resolver: { alias: { '@': './src' } },
    });
    expect(result.resolve?.alias).toEqual({ '@': './src' });
  });

  it('maps resolver.assetExts to resolve.assetExtensions', () => {
    const { config: result } = translateExpoMetroConfig({
      resolver: { assetExts: ['png', 'jpg', 'db', 'sqlite'] },
    });
    expect(result.resolve?.assetExtensions).toEqual(['png', 'jpg', 'db', 'sqlite']);
  });

  it('maps resolver.sourceExts to resolve.sourceExtensions', () => {
    const { config: result } = translateExpoMetroConfig({
      resolver: { sourceExts: ['js', 'jsx', 'ts', 'tsx'] },
    });
    expect(result.resolve?.sourceExtensions).toEqual(['js', 'jsx', 'ts', 'tsx']);
  });

  it('approximates resolver.assetRedirects as object aliases and warns', () => {
    const { config: result, warnings } = translateExpoMetroConfig({
      resolver: { assetRedirects: { './a.png': './b.png' } },
    });
    expect(result.resolve?.alias).toEqual({ './a.png': './b.png' });
    expect(warnings.some((w) => w.includes('assetRedirects'))).toBe(true);
  });

  it('does not emit a resolve block when there is nothing to translate', () => {
    const { config: result } = translateExpoMetroConfig({});
    expect(result.resolve).toBeUndefined();
  });

  it('warns about ignored transformer options', () => {
    const { config: result, warnings } = translateExpoMetroConfig({
      transformer: { babelTransformerPath: './x' },
    });
    // The transformer option must not leak into the Rollipop config...
    expect((result as any).transform).toBeUndefined();
    // ...and the dropped field must be reported in warnings (the caller surfaces it).
    expect(warnings.some((w) => w.includes('transformer'))).toBe(true);
  });
});

describe('isExpoBundlerMode', () => {
  const prev = process.env.EXPO_BUNDLER;
  afterEach(() => {
    if (prev === undefined) delete process.env.EXPO_BUNDLER;
    else process.env.EXPO_BUNDLER = prev;
  });

  it('is true when EXPO_BUNDLER=rollipop', () => {
    process.env.EXPO_BUNDLER = EXPO_BUNDLER_ENV;
    expect(isExpoBundlerMode()).toBe(true);
  });

  it('is false otherwise', () => {
    delete process.env.EXPO_BUNDLER;
    expect(isExpoBundlerMode()).toBe(false);
  });
});

describe('getExpoRouterAppRoot', () => {
  const prev = process.env.EXPO_BUNDLER;
  afterEach(() => {
    if (prev === undefined) delete process.env.EXPO_BUNDLER;
    else process.env.EXPO_BUNDLER = prev;
  });

  it('defaults to "app"', () => {
    const root = mkdtempSync(join(tmpdir(), 'rollipop-root-'));
    expect(getExpoRouterAppRoot(root)).toBe('app');
  });

  it('prefers "src/app" when it exists', () => {
    const root = mkdtempSync(join(tmpdir(), 'rollipop-root-'));
    mkdirSync(join(root, 'src', 'app'), { recursive: true });
    expect(getExpoRouterAppRoot(root)).toBe('src/app');
  });

  it('honors expo.extra.router.root from app.json', () => {
    const root = mkdtempSync(join(tmpdir(), 'rollipop-root-'));
    writeFileSync(
      join(root, 'app.json'),
      JSON.stringify({ expo: { extra: { router: { root: 'src/screens' } } } }),
    );
    expect(getExpoRouterAppRoot(root)).toBe('src/screens');
  });
});
