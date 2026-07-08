import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';

import { startTestServer, type TestServer } from './runtime/harness';

const EXAMPLE_DIR = path.resolve(import.meta.dirname, '../../../examples/0.84');
const IOS_DEV_BUNDLE = '/index.bundle?platform=ios&dev=true';
const ANDROID_DEV_BUNDLE = '/index.bundle?platform=android&dev=true';
const IOS_PROD_BUNDLE = '/index.bundle?platform=ios&dev=false';
const IOS_DEV_MAP = '/index.map?platform=ios&dev=true';

let testServer: TestServer;
let iosDevBundle: Promise<BundleResult> | undefined;
let androidDevBundle: Promise<BundleResult> | undefined;
let iosProdBundle: Promise<BundleResult> | undefined;
let iosDevSourceMap: Promise<Record<string, unknown>> | undefined;

interface BundleResult {
  code: string;
  contentType: string | null;
}

beforeAll(async () => {
  testServer = await startTestServer(EXAMPLE_DIR);
}, 120_000);

afterAll(async () => {
  await testServer?.close();
});

function toUrl(route: string) {
  return `${testServer.baseUrl}${route}`;
}

async function fetchBundle(route: string): Promise<BundleResult> {
  const res = await fetch(toUrl(route));

  expect(res.status).toBe(200);

  const code = await res.text();
  expect(code.length).toBeGreaterThan(0);

  return {
    code,
    contentType: res.headers.get('Content-Type'),
  };
}

function getIosDevBundle() {
  return (iosDevBundle ??= fetchBundle(IOS_DEV_BUNDLE));
}

function getAndroidDevBundle() {
  return (androidDevBundle ??= fetchBundle(ANDROID_DEV_BUNDLE));
}

function getIosProdBundle() {
  return (iosProdBundle ??= fetchBundle(IOS_PROD_BUNDLE));
}

function getIosDevSourceMap() {
  return (iosDevSourceMap ??= (async () => {
    await getIosDevBundle();

    const res = await fetch(toUrl(IOS_DEV_MAP));

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('application/json');

    return (await res.json()) as Record<string, unknown>;
  })());
}

describe('dev server', () => {
  it('GET /status returns packager-status:running', async () => {
    const res = await fetch(toUrl('/status'));

    expect(res.status).toBe(200);
    expect(await res.text()).toBe('packager-status:running');
    // X-React-Native-Project-Root is set by the community middleware
    expect(res.headers.get('X-React-Native-Project-Root')).toBeTruthy();
  });

  describe('bundle serving', () => {
    it('GET /index.bundle?platform=ios&dev=true returns valid JS bundle', async () => {
      const bundle = await getIosDevBundle();
      expect(bundle.contentType).toContain('application/javascript');
      expect(bundle.code.length).toBeGreaterThan(0);
    }, 120_000);

    it('GET /index.bundle?platform=android&dev=true returns valid JS bundle', async () => {
      const bundle = await getAndroidDevBundle();
      expect(bundle.code.length).toBeGreaterThan(0);
    }, 120_000);

    it('GET /index.bundle?platform=ios&dev=false returns production bundle', async () => {
      const bundle = await getIosProdBundle();
      expect(bundle.code.length).toBeGreaterThan(0);
    }, 120_000);
  });

  describe('bundle content - development', () => {
    let code: string;

    beforeAll(async () => {
      code = (await getIosDevBundle()).code;
    }, 120_000);

    it('contains InitializeCore import (prelude)', () => {
      expect(code).toContain('InitializeCore');
    });

    it('contains __DEV__ = true in development mode', () => {
      expect(code).toContain('var __DEV__ = true');
    });

    it('contains __BUNDLE_START_TIME__ for performance tracking', () => {
      expect(code).toContain('__BUNDLE_START_TIME__');
    });

    it('contains process.env.NODE_ENV = "development"', () => {
      expect(code).toContain('NODE_ENV = process.env.NODE_ENV || "development"');
    });

    it('contains React Refresh stubs ($RefreshReg$, $RefreshSig$)', () => {
      expect(code).toContain('$RefreshReg$');
      expect(code).toContain('$RefreshSig$');
    });

    it('contains AppRegistry from user entry', () => {
      expect(code).toContain('AppRegistry');
    });

    it('contains React Native polyfill code', () => {
      expect(code).toContain('ErrorUtils');
    });

    it('contains import.meta.env.MODE = "development"', () => {
      expect(code).toContain('"development"');
    });
  });

  describe('bundle content - production', () => {
    let code: string;

    beforeAll(async () => {
      code = (await getIosProdBundle()).code;
    }, 120_000);

    it('contains __DEV__ = false in production mode', () => {
      expect(code).toContain('var __DEV__ = false');
    });

    it('contains process.env.NODE_ENV = "production"', () => {
      expect(code).toContain('NODE_ENV = process.env.NODE_ENV || "production"');
    });
  });

  describe('bundle content - platform difference', () => {
    let iosCode: string;
    let androidCode: string;

    beforeAll(async () => {
      const [iosBundle, androidBundle] = await Promise.all([
        getIosDevBundle(),
        getAndroidDevBundle(),
      ]);
      iosCode = iosBundle.code;
      androidCode = androidBundle.code;
    }, 120_000);

    it('both platforms produce valid bundles', () => {
      expect(iosCode.length).toBeGreaterThan(1000);
      expect(androidCode.length).toBeGreaterThan(1000);
    });

    it('both platforms contain core React Native code', () => {
      expect(iosCode).toContain('AppRegistry');
      expect(androidCode).toContain('AppRegistry');
    });
  });

  describe('source map serving', () => {
    it('GET /index.map?platform=ios&dev=true returns valid source map', async () => {
      const map = await getIosDevSourceMap();
      expect(map.version).toBe(3);
      expect(map.sources).toBeDefined();
      expect(Array.isArray(map.sources)).toBe(true);
      expect((map.sources as unknown[]).length).toBeGreaterThan(0);
      expect(map.mappings).toBeDefined();
    }, 120_000);
  });

  describe('error handling', () => {
    it('returns non-200 for missing platform parameter', async () => {
      const res = await fetch(toUrl('/index.bundle'));

      // Fastify schema validation or server error for missing required param
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });
});
