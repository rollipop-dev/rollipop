import fs from 'node:fs';
import path from 'node:path';

import { FileStorage } from '../storage/file-storage';

/**
 * Resolve the build cache directory for the given project root. The cache
 * itself is owned by rolldown's native implementation; we keep the path
 * here only because `resetCache` — and any tooling that wants to inspect
 * the on-disk layout — needs to know where to look.
 */
export function getCacheDirectory(projectRoot: string): string {
  return path.join(FileStorage.getPath(projectRoot), 'cache');
}

/**
 * Remove the entire build cache directory for the given project root.
 * Backs the `reset_cache` MCP tool and the `--reset-cache` CLI flag.
 */
export function resetCache(projectRoot: string): void {
  fs.rmSync(getCacheDirectory(projectRoot), { recursive: true, force: true });
}
