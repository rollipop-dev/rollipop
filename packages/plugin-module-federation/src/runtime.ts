export interface ModuleFederationScriptLoader {
  loadScript(args: { scriptId: string; url: string; parentUrl?: string }): Promise<void>;
}

export interface RemoteEntryExports {
  init(shareScope: unknown, initScope?: unknown[]): void | Promise<void>;
  get(modulePath: string): () => Promise<unknown>;
}

declare global {
  // eslint-disable-next-line no-var
  var __rollipop_script_loader__: ModuleFederationScriptLoader | undefined;
  // eslint-disable-next-line no-var
  var __rollipop_module_federation_cache__: { load(id: string): Promise<unknown> } | undefined;
}

/** Retry a failed remote load before resetting the component's Error Boundary. */
export async function retryRemote(id: string): Promise<unknown> {
  const cache = globalThis.__rollipop_module_federation_cache__;
  if (cache == null) {
    throw new Error('[rollipop:module-federation] The host runtime is not initialized.');
  }
  return cache.load(id);
}
