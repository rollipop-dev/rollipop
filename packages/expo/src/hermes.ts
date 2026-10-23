import type { ExpoCompatibility } from './compatibility';
import type { HermesBuildOptions, HermesBuildResult } from './compatibility/cli';

// Reuse the project's RN-matched hermesc lookup and source map composition without creating a Metro graph.
export default async function compileHermesAsync({
  compatibility,
  ...options
}: HermesBuildOptions & { compatibility: ExpoCompatibility }): Promise<HermesBuildResult> {
  return compatibility.cli.buildHermesBundleAsync(options);
}
