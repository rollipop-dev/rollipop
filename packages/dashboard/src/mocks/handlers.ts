import { http, HttpResponse } from 'msw';

import { mockDashboardStore } from './mock-store';

export const handlers = [
  http.get('*/api/snapshot', () => {
    return HttpResponse.json(mockDashboardStore.getSnapshot());
  }),

  http.get('*/api/dev-server/status', () => {
    return HttpResponse.json(mockDashboardStore.getDevServerStatus());
  }),

  http.get('*/api/bundlers', () => {
    return HttpResponse.json(mockDashboardStore.getBundlers());
  }),

  http.get('*/api/bundlers/:bundlerId', ({ params }) => {
    const bundler = mockDashboardStore.getBundler(String(params.bundlerId));

    if (bundler == null) {
      return notFound(`Bundler not found: ${String(params.bundlerId)}`);
    }

    return HttpResponse.json(bundler);
  }),

  http.post('*/api/bundlers/:bundlerId/trigger-full-build', ({ params }) => {
    const bundlerId = String(params.bundlerId);

    if (mockDashboardStore.getBundler(bundlerId) == null) {
      return notFound(`Bundler not found: ${bundlerId}`);
    }

    return HttpResponse.json(mockDashboardStore.triggerFullBuild(bundlerId));
  }),

  http.get('*/index.bundle', ({ request }) => {
    const bundle = createMockBundle(new URL(request.url));

    return new HttpResponse(bundle, {
      headers: {
        'content-length': String(new TextEncoder().encode(bundle).byteLength),
        'content-type': 'application/javascript; charset=utf-8',
      },
    });
  }),

  http.head('*/dashboard/analyze-report/:reportFile', ({ params }) => {
    const report = mockDashboardStore.getAnalyzeReport(
      getReportBundlerId(String(params.reportFile)),
    );

    return new HttpResponse(null, {
      status: report == null ? 404 : 200,
      headers: report == null ? undefined : { 'content-type': 'text/html; charset=utf-8' },
    });
  }),

  http.get('*/dashboard/analyze-report/:reportFile', ({ params }) => {
    const bundlerId = getReportBundlerId(String(params.reportFile));
    const report = mockDashboardStore.getAnalyzeReport(bundlerId);

    if (report == null) {
      return notFound(`Analyze report not found: ${bundlerId}`);
    }

    return new HttpResponse(report, {
      headers: {
        'content-type': 'text/html; charset=utf-8',
      },
    });
  }),

  http.get('*/api/builds', () => {
    return HttpResponse.json(mockDashboardStore.getBuilds());
  }),

  http.get('*/api/builds/:bundlerId', ({ params }) => {
    const build = mockDashboardStore.getBuild(String(params.bundlerId));

    if (build == null) {
      return notFound(`Build not found: ${String(params.bundlerId)}`);
    }

    return HttpResponse.json(build);
  }),

  http.get('*/api/builds/:bundlerId/logs', ({ params }) => {
    const logs = mockDashboardStore.getBuildLogs(String(params.bundlerId));

    if (logs == null) {
      return notFound(`Build logs not found: ${String(params.bundlerId)}`);
    }

    return HttpResponse.json(logs);
  }),

  http.delete('*/api/builds/:bundlerId/logs', ({ params }) => {
    const bundlerId = String(params.bundlerId);
    const deleted = mockDashboardStore.deleteBuildLogs(bundlerId);

    if (!deleted) {
      return notFound(`Build logs not found: ${bundlerId}`);
    }

    return HttpResponse.json({ deleted: true, bundlerId });
  }),

  http.get('*/api/devices', () => {
    return HttpResponse.json(mockDashboardStore.getDevices());
  }),

  http.get('*/api/devices/:deviceId', ({ params }) => {
    const device = mockDashboardStore.getDevice(String(params.deviceId));

    if (device == null) {
      return notFound(`Device not found: ${String(params.deviceId)}`);
    }

    return HttpResponse.json(device);
  }),

  http.get('*/api/config', () => {
    return HttpResponse.json(mockDashboardStore.getConfig());
  }),

  http.get('*/api/feature-flags', () => {
    return HttpResponse.json(mockDashboardStore.getFeatureFlags());
  }),

  http.post('*/api/actions/reload', () => {
    return HttpResponse.json(mockDashboardStore.reloadDevices());
  }),

  http.post('*/api/actions/reset-cache', () => {
    return HttpResponse.json(mockDashboardStore.resetCache());
  }),

  http.post('*/api/actions/reset-bundler-state', () => {
    return HttpResponse.json(mockDashboardStore.resetBundlerState());
  }),

  http.post('*/symbolicate', async ({ request }) => {
    const body = (await request.json()) as {
      stack?: Array<{ file?: string; lineNumber?: number; column?: number }>;
    };
    const frame = body.stack?.[0] ?? {};
    const sourceLine = Math.max(1, Math.floor((frame.lineNumber ?? 1) / 8));
    const sourceColumn = Math.max(0, Math.floor((frame.column ?? 0) / 2));

    return HttpResponse.json({
      stack: [
        {
          file: 'src/App.tsx',
          lineNumber: sourceLine,
          column: sourceColumn,
          methodName: 'render',
          collapse: false,
        },
      ],
      codeFrame: {
        content: `  ${sourceLine - 1} | export function App() {\\n> ${sourceLine} |   return <Root />;\\n    |          ^`,
        fileName: 'src/App.tsx',
        location: {
          row: sourceLine,
          column: sourceColumn,
        },
      },
    });
  }),
];

function notFound(message: string) {
  return HttpResponse.json(
    {
      error: {
        code: 'NOT_FOUND',
        message,
      },
    },
    { status: 404 },
  );
}

function getReportBundlerId(reportFile: string): string {
  return reportFile.endsWith('.html') ? reportFile.slice(0, -'.html'.length) : reportFile;
}

function createMockBundle(url: URL) {
  const platform = url.searchParams.get('platform') ?? 'unknown';
  const dev = url.searchParams.get('dev') ?? 'true';
  const lines = [
    `// Mock Rollipop bundle`,
    `// platform=${platform} dev=${dev}`,
    `'use strict';`,
    '',
  ];

  for (let index = 0; index < 2500; index += 1) {
    lines.push(
      `__d(function(global, require, module, exports) { module.exports = ${index}; }, ${index}, [], "module-${index}");`,
    );
  }

  return `${lines.join('\n')}\n`;
}
