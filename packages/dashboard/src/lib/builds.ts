import type { Build } from '../types/dashboard';

export function getAverageBuildDuration(builds: Build[]) {
  const completedBuilds = builds.filter((build) => build.durationMs != null);

  if (completedBuilds.length === 0) {
    return null;
  }

  return Math.round(
    completedBuilds.reduce((total, build) => total + (build.durationMs ?? 0), 0) /
      completedBuilds.length,
  );
}

export function getLogCounts(build: Build) {
  return build.messages;
}

export function shortId(id: string) {
  return id.slice(0, 10);
}
