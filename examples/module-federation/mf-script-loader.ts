import type { ModuleFederationScriptLoader } from '@rollipop/plugin-module-federation/runtime';

declare global {
  var nativeModuleProxy: any;
}

const NativeScriptManager = globalThis.nativeModuleProxy.ScriptManager;

if (NativeScriptManager == null) {
  throw new Error('NativeScriptManager is not available');
}

const loaderImpl: ModuleFederationScriptLoader = {
  async loadScript({ scriptId, url, parentUrl }) {
    console.log('[ScriptLoader] loadScript', { scriptId, url, parentUrl });
    await NativeScriptManager.loadScript(scriptId, { url, parentUrl: parentUrl ?? null });
  },
};

globalThis.__rollipop_script_loader__ = loaderImpl;
