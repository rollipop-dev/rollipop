import path from 'node:path';

import { getSharedDataPath } from './fs/data';

export function getAnalyzeDirectory(projectRoot: string) {
  return path.join(getSharedDataPath(projectRoot), 'analyze');
}

export function getAnalyzeDataPath(projectRoot: string, bundlerId: string) {
  return path.join(getAnalyzeDirectory(projectRoot), `${bundlerId}.json`);
}

export function getAnalyzeReportPath(projectRoot: string, bundlerId: string) {
  return path.join(getAnalyzeDirectory(projectRoot), `${bundlerId}.html`);
}
