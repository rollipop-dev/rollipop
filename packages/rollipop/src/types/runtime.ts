import type { ReactRefresh } from '../runtime/react-refresh-utils';
import type { HMRClientMessage, HMRCustomHandler } from './hmr';

export interface RollipopDevRuntime {
  reactRefresh: ReactRefresh;
  customHMRHandler: HMRCustomHandler | undefined;
}

export interface DevRuntimeModule {
  exportsHolder: { exports: any };
  id: string;
  exports: any;
}

export interface DevRuntimeInterface {
  modules: Record<string, DevRuntimeModule>;
  createModuleHotContext(moduleId: string): void;
  applyUpdates(boundaries: [string, string][]): void;
  registerModule(id: string, exportsHolder: DevRuntimeModule['exportsHolder']): void;
  loadExports(id: string): void;
}

class DevRuntime implements DevRuntimeInterface {
  // oxlint-disable-next-line no-unused-vars
  constructor(messenger: DevRuntimeMessenger) {}
  modules: Record<string, DevRuntimeModule> = {};
  // oxlint-disable-next-line no-unused-vars
  createModuleHotContext(moduleId: string): void {
    throw new Error('createModuleHotContext should be implemented');
  }
  // oxlint-disable-next-line no-unused-vars
  applyUpdates(boundaries: [string, string][]): void {
    throw new Error('applyUpdates should be implemented');
  }
  // oxlint-disable-next-line no-unused-vars
  registerModule(id: string, exportsHolder: DevRuntimeModule['exportsHolder']): void {
    throw new Error('registerModule should be implemented');
  }
  // oxlint-disable-next-line no-unused-vars
  loadExports(id: string): void {
    throw new Error('loadExports should be implemented');
  }
}

export interface DevRuntimeMessenger {
  send(message: HMRClientMessage): void;
}

export type { DevRuntime };
