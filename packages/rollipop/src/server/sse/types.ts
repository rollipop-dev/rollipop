export type SSEEvent =
  // Build lifecycle events (from reporter pipeline, always have bundler id)
  | { type: 'bundle_build_started'; bundlerId: string }
  | {
      type: 'bundle_build_done';
      bundlerId: string;
      totalModules: number;
      transformedModules: number;
      cacheHitModules: number;
      duration: number;
    }
  | { type: 'bundle_build_failed'; bundlerId: string; error: string }
  | { type: 'watch_change'; bundlerId: string; file: string }
  // Client log events (from HMR client)
  | { type: 'client_log'; data: unknown[]; bundlerId?: string }
  // Device lifecycle events
  | { type: 'device_connected'; clientId: number }
  | { type: 'device_disconnected'; clientId: number }
  // Server lifecycle events
  | { type: 'server_ready'; host: string; port: number }
  // Control API events
  | { type: 'cache_reset' };
