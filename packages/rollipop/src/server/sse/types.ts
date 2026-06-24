export type SSEBuildEvent =
  // Build lifecycle events (from reporter pipeline, always have bundler id)
  | { type: 'bundle_build_started'; bundlerId: string }
  | {
      type: 'bundle_build_done';
      bundlerId: string;
      totalModules: number;
      transformedModules: number;
      cacheHitModules: number;
      duration: number;
      bundleFilePath?: string;
    }
  | { type: 'bundle_build_failed'; bundlerId: string; error: string }
  | { type: 'hmr_failed'; bundlerId: string; error: string }
  | { type: 'watch_change'; bundlerId: string; file: string }
  // HMR client lifecycle events
  | { type: 'client_connected'; clientId: number }
  | { type: 'client_disconnected'; clientId: number }
  // Server lifecycle events
  | { type: 'server_ready'; host: string; port: number }
  // Control API events
  | { type: 'cache_reset' };

// Client log events (from HMR client)
export type SSEClientLogEvent = { type: 'client_log'; data: unknown[]; bundlerId?: string };

export type SSEEvent = SSEBuildEvent | SSEClientLogEvent;
