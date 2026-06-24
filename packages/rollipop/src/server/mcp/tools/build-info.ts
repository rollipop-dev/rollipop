import type { ResolvedConfig } from '../../../config';
import { loadEnv } from '../../../core/env';
import { toJsonSafe } from '../../../utils/serialize';

export function getBuildInfo(config: ResolvedConfig): Record<string, unknown> {
  return toJsonSafe({ ...config, env: loadEnv(config) }) as Record<string, unknown>;
}
