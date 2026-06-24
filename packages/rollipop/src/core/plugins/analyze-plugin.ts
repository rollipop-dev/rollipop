import fs from 'node:fs';
import path from 'node:path';

import type * as rolldown from '@rollipop/rolldown';
import * as rolldownExperimental from '@rollipop/rolldown/experimental';
import open from 'open';
import { generateReport } from 'rolldown-analyzer/node';

import type { AnalyzerConfig } from '../../config';
import { getAnalyzeDataPath, getAnalyzeReportPath } from '../analyze';
import type { BundlerContext } from '../types';

export interface AnalyzePluginOptions extends Required<AnalyzerConfig> {
  context: BundlerContext;
}

function analyzePlugin(options: AnalyzePluginOptions): rolldown.Plugin[] | null {
  if (!options.enabled) {
    return null;
  }

  const { analyzeFile, reportFile, autoOpen, context } = options;

  const generateReportPlugin: rolldown.Plugin = {
    name: 'rollipop:analyze',
    async generateBundle(outputOptions, output) {
      const targetAsset = output[analyzeFile];
      if (targetAsset?.type !== 'asset') {
        this.debug(`Analyzer plugin: No asset found for ${analyzeFile}`);
        return;
      }

      const outDir = getOutDir(outputOptions);
      let analyzeFilePath: string;
      let reportFilePath: string;

      if (outDir == null || context.buildType === 'serve') {
        analyzeFilePath = getAnalyzeDataPath(context.root, context.id);
        reportFilePath = getAnalyzeReportPath(context.root, context.id);
      } else {
        analyzeFilePath = path.resolve(outDir, analyzeFile);
        reportFilePath = path.resolve(outDir, reportFile);
      }

      fs.mkdirSync(path.dirname(analyzeFilePath), { recursive: true });
      fs.mkdirSync(path.dirname(reportFilePath), { recursive: true });
      fs.writeFileSync(analyzeFilePath, targetAsset.source);

      await generateReport({
        preset: 'lite',
        dataPath: analyzeFilePath,
        filename: reportFilePath,
      });

      if (context.buildType === 'build') {
        this.info(`Analysis data generated at '${analyzeFilePath}'`);
        this.info(`Analysis report generated at '${reportFilePath}'`);

        if (autoOpen) {
          this.info(`Opening analysis report in your browser...`);
          open(reportFilePath).catch((error) => {
            this.warn('Failed to open analysis report automatically');
            this.debug(error instanceof Error ? error.message : String(error));
          });
        }
      }
    },
  };

  return [
    rolldownExperimental.bundleAnalyzerPlugin({ fileName: analyzeFile }),
    generateReportPlugin,
  ];
}

function getOutDir<
  Options extends {
    dir: string | undefined;
    file: string | undefined;
  },
>(options: Options) {
  if (options.dir) {
    return options.dir;
  }

  if (options.file) {
    return path.dirname(options.file);
  }

  return null;
}

export { analyzePlugin as analyze };
