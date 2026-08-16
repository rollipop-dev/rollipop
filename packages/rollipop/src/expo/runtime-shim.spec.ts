import { describe, expect, it } from 'vitest';

import { expoMetroRuntimeShimCode } from '../core/plugins/expo-metro-runtime-shim-code';
import * as shimModule from './runtime-shim';

const EXPECTED_EXPORTS = [
  'createRuntimeError',
  'getDevServer',
  'enableExperimental',
  'clearSegmentCache',
  'loadBundleAsync',
  'reload',
  'LogBox',
  '__mapper',
  'setMapper',
] as const;

describe('expo metro-runtime shim', () => {
  it('runtime-shim.ts exports the full @expo/metro-runtime surface', () => {
    for (const name of EXPECTED_EXPORTS) {
      expect((shimModule as Record<string, unknown>)[name]).toBeDefined();
    }
    expect(typeof shimModule.default).toBe('object');
  });

  it('inlined shim code string exposes the same export names', async () => {
    // Evaluate the inlined JS as a module to assert parity with runtime-shim.ts.
    const dataUrl = `data:text/javascript;base64,${Buffer.from(expoMetroRuntimeShimCode).toString('base64')}`;
    const mod = (await import(dataUrl)) as Record<string, unknown>;
    for (const name of EXPECTED_EXPORTS) {
      expect(mod[name]).toBeDefined();
    }
    expect(typeof mod.default).toBe('object');
  });

  it('createRuntimeError preserves the message', () => {
    const err = shimModule.createRuntimeError('boom');
    expect(err.message).toBe('boom');
    expect(err).toBeInstanceOf(Error);
  });

  it('reload is callable and does not throw in a non-browser, no-HMR env', () => {
    expect(() => shimModule.reload()).not.toThrow();
  });

  it('getDevServer reads ROLLIPOP_DEV_SERVER_URL from process.env (matches runtime-shim.ts)', async () => {
    const dataUrl = `data:text/javascript;base64,${Buffer.from(expoMetroRuntimeShimCode).toString('base64')}`;
    const mod = (await import(dataUrl)) as Record<string, (...args: any[]) => any>;

    const prev = process.env.ROLLIPOP_DEV_SERVER_URL;
    try {
      delete process.env.ROLLIPOP_DEV_SERVER_URL;
      expect(mod.getDevServer()).toBeNull();

      process.env.ROLLIPOP_DEV_SERVER_URL = 'http://localhost:8081';
      expect(mod.getDevServer()).toEqual({ url: 'http://localhost:8081' });
    } finally {
      if (prev === undefined) delete process.env.ROLLIPOP_DEV_SERVER_URL;
      else process.env.ROLLIPOP_DEV_SERVER_URL = prev;
    }
  });
});
