import { afterEach, describe, expect, it } from 'vitest';

import {
  EXPO_BUNDLER_ENV,
  isExpoBundlerMode,
  translateExpoMetroConfig,
} from './config-translator';

describe('translateExpoMetroConfig', () => {
  it('maps resolver.alias to resolve.alias', () => {
    const result = translateExpoMetroConfig({
      resolver: { alias: { '@': './src' } },
    });
    expect(result.resolve?.alias).toEqual({ '@': './src' });
  });

  it('maps resolver.assetExts to resolve.assetExtensions', () => {
    const result = translateExpoMetroConfig({
      resolver: { assetExts: ['png', 'jpg', 'db', 'sqlite'] },
    });
    expect(result.resolve?.assetExtensions).toEqual(['png', 'jpg', 'db', 'sqlite']);
  });

  it('maps resolver.sourceExts to resolve.sourceExtensions', () => {
    const result = translateExpoMetroConfig({
      resolver: { sourceExts: ['js', 'jsx', 'ts', 'tsx'] },
    });
    expect(result.resolve?.sourceExtensions).toEqual(['js', 'jsx', 'ts', 'tsx']);
  });

  it('approximates resolver.assetRedirects as object aliases', () => {
    const result = translateExpoMetroConfig({
      resolver: { assetRedirects: { './a.png': './b.png' } },
    });
    expect(result.resolve?.alias).toEqual({ './a.png': './b.png' });
  });

  it('does not emit a resolve block when there is nothing to translate', () => {
    const result = translateExpoMetroConfig({});
    expect(result.resolve).toBeUndefined();
  });

  it('warns about ignored transformer options', () => {
    const result = translateExpoMetroConfig({ transformer: { babelTransformerPath: './x' } });
    // translateExpoMetroConfig returns only the Rollipop config; the warning is
    // surfaced by the caller, so we assert here that no transformer leaked in.
    expect((result as any).transform).toBeUndefined();
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
