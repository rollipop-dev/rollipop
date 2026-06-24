import type {
  Build,
  BuildLog,
  BundlerInstance,
  ConnectedDevice,
  DashboardConfig,
  DashboardSnapshot,
  FeatureFlags,
  ProjectInfo,
} from '../types/dashboard';

export class MockDashboardStore {
  private readonly startedAt = Date.now();
  private readonly config = createConfig();
  private readonly bundlers = createBundlers();
  private readonly analyzeReports = createAnalyzeReports(this.bundlers);
  private readonly devices = createDevices();
  private builds = createBuilds();
  private logsByBundlerId = createBuildLogs();
  private project = createProject(this.config.path, this.startedAt);

  getSnapshot(): DashboardSnapshot {
    return clone({
      project: this.getProject(),
      bundlers: this.getBundlers(),
      devices: this.getDevices(),
      buildSummary: {
        count: this.builds.length,
        latest: this.builds[0] ?? null,
      },
    });
  }

  getProject(): ProjectInfo {
    this.project.server.uptimeMs = Date.now() - this.startedAt;
    return clone(this.project);
  }

  getConfig(): DashboardConfig {
    return clone(this.config);
  }

  getFeatureFlags(): FeatureFlags {
    return {
      analyze: true,
    };
  }

  getDevServerStatus(): ProjectInfo['server'] {
    return clone(this.getProject().server);
  }

  getBundlers(): BundlerInstance[] {
    return clone(this.bundlers);
  }

  getBundler(id: string): BundlerInstance | undefined {
    const bundler = this.bundlers.find((item) => item.id === id);

    return bundler == null ? undefined : clone(bundler);
  }

  getAnalyzeReport(id: string): string | undefined {
    return this.analyzeReports.get(id);
  }

  getBuilds(): Build[] {
    return clone(this.builds);
  }

  getBuild(id: string): Build | undefined {
    const build = this.builds.find((item) => item.id === id);

    return build == null ? undefined : clone(build);
  }

  getBuildLogs(id: string): BuildLog[] | undefined {
    const build = this.builds.find((item) => item.id === id || item.bundlerId === id);
    const bundler = this.bundlers.find((item) => item.id === id);

    if (build == null && bundler == null) {
      return undefined;
    }

    return clone(this.logsByBundlerId.get(build?.bundlerId ?? id) ?? []);
  }

  deleteBuildLogs(id: string) {
    const build = this.builds.find((item) => item.id === id || item.bundlerId === id);
    const bundler = this.bundlers.find((item) => item.id === id);
    if (build == null && bundler == null) {
      return false;
    }

    if (build != null) {
      build.messages = { info: 0, warn: 0, error: 0 };
    }

    this.logsByBundlerId.set(build?.bundlerId ?? id, []);

    return true;
  }

  getDevices(): ConnectedDevice[] {
    return clone(this.devices.map(({ debugTarget: _debugTarget, ...device }) => device));
  }

  getDevice(id: string): ConnectedDevice | undefined {
    const device = this.devices.find((item) => item.id === id);

    return device == null ? undefined : clone(device);
  }

  reloadDevices() {
    return { reloaded: true };
  }

  resetCache() {
    return { reset: true };
  }

  resetBundlerState() {
    this.builds = [];
    this.logsByBundlerId = new Map();

    return { reset: true };
  }

  triggerFullBuild(bundlerId: string) {
    const startedAt = new Date().toISOString();
    const build: Build = {
      id: bundlerId,
      bundlerId,
      startedAt,
      endedAt: null,
      durationMs: null,
      status: 'pending',
      messages: { info: 1, warn: 0, error: 0 },
    };

    this.builds = [build, ...this.builds.filter((item) => item.bundlerId !== bundlerId)];
    this.logsByBundlerId.set(bundlerId, [
      {
        id: `log-${Date.now()}`,
        level: 'info',
        source: 'rollipop',
        message: 'Build started.',
        timestamp: startedAt,
      },
    ]);

    return { triggered: true, bundlerId };
  }
}

function createProject(configPath: string | null, startedAt: number): ProjectInfo {
  return {
    bundlerVersion: '1.0.0-alpha.24',
    rootPath: '/path/to/project',
    configPath,
    server: {
      host: 'localhost',
      port: 8081,
      status: 'listening',
      startedAt: new Date(startedAt).toISOString(),
      uptimeMs: 0,
    },
  };
}

function createConfig(): DashboardConfig {
  const path = '/path/to/project/rollipop.config.ts';
  const resolved = {
    root: '/path/to/project',
    mode: 'development',
    entry: 'index.js',
    resolver: {
      sourceExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
      assetExtensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'],
      mainFields: ['react-native', 'browser', 'module', 'main'],
      preferNativePlatform: true,
      symlinks: true,
    },
    watcher: {
      skipWrite: true,
      useDebounce: true,
      debounceDuration: 50,
    },
    devMode: {
      hmr: true,
    },
    runtimeTarget: 'hermes',
    experimental: {
      nativeTransformPipeline: false,
    },
  };

  return {
    path,
    resolved,
    serialized: JSON.stringify(resolved, null, 2),
  };
}

function createBundlers(): BundlerInstance[] {
  return [
    {
      id: 'bf3a91c-ios-dev-index',
      platform: 'ios',
      dev: true,
      entry: 'index',
      status: 'build-done',
      bundleUrl: 'http://localhost:8081/index.bundle?platform=ios&dev=true&minify=false',
      sourceMapUrl: 'http://localhost:8081/index.map?platform=ios&dev=true&minify=false',
      buildOptions: {
        dev: true,
        platform: 'ios',
        minify: false,
      },
    },
    {
      id: 'a6d04e2-android-dev-index',
      platform: 'android',
      dev: true,
      entry: 'index',
      status: 'building',
      bundleUrl: 'http://localhost:8081/index.bundle?platform=android&dev=true&minify=false',
      sourceMapUrl: 'http://localhost:8081/index.map?platform=android&dev=true&minify=false',
      buildOptions: {
        dev: true,
        platform: 'android',
        minify: false,
      },
    },
    {
      id: 'ce79b12-ios-prod-index',
      platform: 'ios',
      dev: false,
      entry: 'index',
      status: 'idle',
      bundleUrl: 'http://localhost:8081/index.bundle?platform=ios&dev=false&minify=true',
      sourceMapUrl: 'http://localhost:8081/index.map?platform=ios&dev=false&minify=true',
      buildOptions: {
        dev: false,
        platform: 'ios',
        minify: true,
      },
    },
  ];
}

function createDevices(): ConnectedDevice[] {
  return [
    {
      id: '8f31a2c4d0',
      name: 'org.reactjs.native.example.Example (iPhone Air)',
      debuggerUrl: 'http://localhost:8081/debugger-ui?target=8f31a2c4d0',
      debugTarget: {
        id: '8f31a2c4d0',
        title: 'G.H. iPhone',
        type: 'node',
        devtoolsFrontendUrl: '/debugger-ui?target=8f31a2c4d0',
        webSocketDebuggerUrl: 'ws://localhost:8081/debugger-proxy?target=8f31a2c4d0',
      },
    },
    {
      id: '7b42d0c5a1',
      name: 'org.reactjs.native.example.Example (Pixel 8 Pro)',
      debuggerUrl: 'http://localhost:8081/debugger-ui?target=7b42d0c5a1',
      debugTarget: {
        id: '7b42d0c5a1',
        title: 'Pixel 8 Pro',
        type: 'node',
        devtoolsFrontendUrl: '/debugger-ui?target=7b42d0c5a1',
        webSocketDebuggerUrl: 'ws://localhost:8081/debugger-proxy?target=7b42d0c5a1',
      },
    },
  ];
}

function createAnalyzeReports(bundlers: BundlerInstance[]): Map<string, string> {
  const reportBundlers = bundlers.filter((bundler) => bundler.platform === 'ios');

  return new Map(
    reportBundlers.map((bundler) => [
      bundler.id,
      `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Mock Analyze Report</title>
    <style>
      body {
        margin: 0;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: #18181b;
        background: #fafafa;
      }
      main {
        padding: 32px;
      }
      h1 {
        margin: 0 0 8px;
        font-size: 24px;
      }
      p {
        margin: 0 0 24px;
        color: #71717a;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 12px;
      }
      .card {
        border: 1px solid #e4e4e7;
        border-radius: 12px;
        background: white;
        padding: 16px;
      }
      .value {
        margin-top: 8px;
        font-size: 28px;
        font-weight: 700;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Mock Analyze Report</h1>
      <p>${bundler.platform} / ${bundler.dev ? 'dev' : 'prod'} / ${bundler.id}</p>
      <section class="grid">
        <div class="card">Modules<div class="value">1,248</div></div>
        <div class="card">Bundle size<div class="value">2.8 MB</div></div>
        <div class="card">Largest module<div class="value">react</div></div>
      </section>
    </main>
  </body>
</html>`,
    ]),
  );
}

function createBuilds(): Build[] {
  const now = Date.now();

  return [
    {
      id: 'bf3a91c-ios-dev-index',
      bundlerId: 'bf3a91c-ios-dev-index',
      startedAt: new Date(now - 65_000).toISOString(),
      endedAt: new Date(now - 63_160).toISOString(),
      durationMs: 1840,
      status: 'success',
      messages: { info: 3, warn: 0, error: 0 },
    },
    {
      id: 'a6d04e2-android-dev-index',
      bundlerId: 'a6d04e2-android-dev-index',
      startedAt: new Date(now - 180_000).toISOString(),
      endedAt: null,
      durationMs: null,
      status: 'pending',
      messages: { info: 1, warn: 1, error: 0 },
    },
    {
      id: 'ce79b12-ios-prod-index',
      bundlerId: 'ce79b12-ios-prod-index',
      startedAt: new Date(now - 460_000).toISOString(),
      endedAt: new Date(now - 455_140).toISOString(),
      durationMs: 4860,
      status: 'failed',
      messages: { info: 1, warn: 1, error: 2 },
    },
  ];
}

function createBuildLogs(): Map<string, BuildLog[]> {
  const now = Date.now();

  return new Map([
    [
      'bf3a91c-ios-dev-index',
      [
        {
          id: 'log-1006-1',
          level: 'info',
          source: 'rollipop',
          message: 'Build started.',
          timestamp: new Date(now - 65_000).toISOString(),
        },
        {
          id: 'log-1006-2',
          level: 'info',
          source: 'react-native',
          message: 'Collected 124 modules for the bundle.',
          timestamp: new Date(now - 64_000).toISOString(),
        },
        {
          id: 'log-1006-3',
          level: 'info',
          source: 'rollipop',
          message: 'Build completed in 1840.00ms.',
          timestamp: new Date(now - 63_160).toISOString(),
        },
      ],
    ],
    [
      'a6d04e2-android-dev-index',
      [
        {
          id: 'log-1005-1',
          level: 'info',
          source: 'rollipop',
          message: 'Build started.',
          timestamp: new Date(now - 180_000).toISOString(),
        },
        {
          id: 'log-1005-2',
          level: 'warn',
          source: 'asset',
          message: 'Large image asset will be emitted without resizing.',
          timestamp: new Date(now - 178_000).toISOString(),
        },
      ],
    ],
    [
      'ce79b12-ios-prod-index',
      [
        {
          id: 'log-1004-1',
          level: 'info',
          source: 'rollipop',
          message: 'Build started.',
          timestamp: new Date(now - 460_000).toISOString(),
        },
        {
          id: 'log-1004-2',
          level: 'warn',
          source: 'env',
          message: 'PUBLIC_API_BASE_URL is missing and will use the development fallback.',
          timestamp: new Date(now - 459_000).toISOString(),
        },
        {
          id: 'log-1004-3',
          level: 'error',
          source: 'resolver',
          message: 'Unable to resolve ./src/App from index.ts.',
          timestamp: new Date(now - 456_000).toISOString(),
        },
        {
          id: 'log-1004-4',
          level: 'error',
          source: 'rollipop',
          message: 'Build failed: Unable to resolve ./src/App from index.ts.',
          timestamp: new Date(now - 455_140).toISOString(),
        },
      ],
    ],
  ]);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export const mockDashboardStore = new MockDashboardStore();
