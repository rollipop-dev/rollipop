import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: true,
      retry: false,
      staleTime: 5_000,
    },
  },
});

export const queryKeys = {
  root: ['dashboard'] as const,
  snapshot: ['dashboard', 'snapshot'] as const,
  builds: ['dashboard', 'builds'] as const,
  config: ['dashboard', 'config'] as const,
  featureFlags: ['dashboard', 'feature-flags'] as const,
  device: (deviceId: string) => ['dashboard', 'devices', deviceId] as const,
  analyzeReport: (bundlerId: string) => ['dashboard', 'analyze-report', bundlerId] as const,
  buildLogsRoot: ['dashboard', 'build-logs'] as const,
  buildLogs: (bundlerId: string) => ['dashboard', 'build-logs', bundlerId] as const,
};
