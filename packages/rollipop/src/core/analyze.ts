import path from 'node:path';

import { FileStorage } from '../storage/file-storage';

export function getAnalyzeDirectory(projectRoot: string) {
  return path.join(FileStorage.getPath(projectRoot), 'analyze');
}

export function getAnalyzeDataPath(projectRoot: string, bundlerId: string) {
  return path.join(getAnalyzeDirectory(projectRoot), `${bundlerId}.json`);
}

export function getAnalyzeReportPath(projectRoot: string, bundlerId: string) {
  return path.join(getAnalyzeDirectory(projectRoot), `${bundlerId}.html`);
}
