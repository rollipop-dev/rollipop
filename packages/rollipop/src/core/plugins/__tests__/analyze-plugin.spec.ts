import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import type { BundlerContext } from '../../types';
import { analyze } from '../analyze-plugin';
import type { Plugin } from '../types';

const mocks = vi.hoisted(() => ({
  generateReport: vi.fn(),
  open: vi.fn(() => Promise.resolve()),
}));

vi.mock('rolldown-analyzer/node', () => ({
  generateReport: mocks.generateReport,
}));

vi.mock('open', () => ({
  default: mocks.open,
}));

describe('analyze', () => {
  afterEach(() => {
    mocks.generateReport.mockReset();
    mocks.open.mockClear();
  });

  it('uses the bundle output directory when one is available', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rollipop-analyzer-'));
    const outDir = path.join(root, 'dist', 'ios');
    const plugin = getGenerateReportPlugin(createContext(root, 'build'));
    const context = createPluginContext();

    await callGenerateBundle(plugin, context, {
      outputOptions: { file: path.join(outDir, 'main.bundle'), dir: undefined },
      output: createAnalyzerOutput('analyze-data.json'),
    });

    const analyzeFilePath = path.join(outDir, 'analyze-data.json');
    const reportFilePath = path.join(outDir, 'report.html');

    expect(fs.readFileSync(analyzeFilePath, 'utf-8')).toBe('{}');
    expect(mocks.generateReport).toHaveBeenCalledWith({
      preset: 'lite',
      dataPath: analyzeFilePath,
      filename: reportFilePath,
    });
    expect(context.info).toHaveBeenCalledWith(`Analysis data generated at '${analyzeFilePath}'`);
    expect(context.info).toHaveBeenCalledWith(`Analysis report generated at '${reportFilePath}'`);
  });

  it('uses an id-scoped shared analyzer path when no output directory is available', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rollipop-analyzer-'));
    const plugin = getGenerateReportPlugin(createContext(root));

    await callGenerateBundle(plugin, createPluginContext(), {
      outputOptions: { file: undefined, dir: undefined },
      output: createAnalyzerOutput('analyze-data.json'),
    });

    const analyzeFilePath = path.join(root, '.rollipop', 'analyze', 'test-bundler-id.json');
    const reportFilePath = path.join(root, '.rollipop', 'analyze', 'test-bundler-id.html');

    expect(fs.readFileSync(analyzeFilePath, 'utf-8')).toBe('{}');
    expect(mocks.generateReport).toHaveBeenCalledWith({
      preset: 'lite',
      dataPath: analyzeFilePath,
      filename: reportFilePath,
    });
  });

  it('opens the report only for build mode when autoOpen is enabled', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rollipop-analyzer-'));
    const plugin = getGenerateReportPlugin(createContext(root, 'build'), { autoOpen: true });

    await callGenerateBundle(plugin, createPluginContext(), {
      outputOptions: { file: path.join(root, 'dist', 'main.bundle'), dir: undefined },
      output: createAnalyzerOutput('analyze-data.json'),
    });

    expect(mocks.open).toHaveBeenCalledWith(path.join(root, 'dist', 'report.html'));
  });
});

function getGenerateReportPlugin(
  context: BundlerContext,
  options?: Partial<Parameters<typeof analyze>[0]>,
) {
  const plugins = analyze({
    context,
    enabled: true,
    analyzeFile: 'analyze-data.json',
    reportFile: 'report.html',
    autoOpen: false,
    ...options,
  }) as Plugin[];

  return plugins[1]!;
}

function createContext(
  root: string,
  buildType: BundlerContext['buildType'] = 'serve',
): BundlerContext {
  return {
    id: 'test-bundler-id',
    root,
    buildType,
    storage: {} as BundlerContext['storage'],
    state: { revision: 0, latestBuildStartTime: 0 },
  };
}

function createPluginContext() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  };
}

function createAnalyzerOutput(fileName: string) {
  return {
    [fileName]: {
      type: 'asset',
      fileName,
      source: '{}',
    },
  };
}

async function callGenerateBundle(
  plugin: Plugin,
  context: ReturnType<typeof createPluginContext>,
  args: {
    outputOptions: { dir: string | undefined; file: string | undefined };
    output: ReturnType<typeof createAnalyzerOutput>;
  },
) {
  const hook = plugin.generateBundle as unknown as
    | ((
        this: ReturnType<typeof createPluginContext>,
        outputOptions: typeof args.outputOptions,
        output: typeof args.output,
        isWrite: boolean,
      ) => void | Promise<void>)
    | {
        handler: (
          this: ReturnType<typeof createPluginContext>,
          outputOptions: typeof args.outputOptions,
          output: typeof args.output,
          isWrite: boolean,
        ) => void | Promise<void>;
      };

  const handler = typeof hook === 'function' ? hook : hook.handler;
  await handler.call(context, args.outputOptions, args.output, false);
}
