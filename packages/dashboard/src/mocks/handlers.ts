import { http, HttpResponse } from 'msw';

import { mockDashboardStore } from './mock-store';

export const handlers = [
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
