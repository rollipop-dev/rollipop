import * as rolldownExperimental from '@rollipop/rolldown/experimental';

/**
 * Clear the build cache.
 */
export function resetCache() {
  return rolldownExperimental.clearCache();
}
