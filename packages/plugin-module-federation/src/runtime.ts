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
}
