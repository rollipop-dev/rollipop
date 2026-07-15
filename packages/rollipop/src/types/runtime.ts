import type { ReactRefresh } from '../runtime/react-refresh-utils';
import type { HMRContext, HMRCustomHandler } from './hmr';

export interface RollipopDevRuntime {
  reactRefresh: ReactRefresh;
  graphs: Map<string, HMRGraph>;
  customHMRHandler: HMRCustomHandler | undefined;
  registerGraph(graph: HMRGraph): void;
  subscribeGraph(listener: (graph: HMRGraph) => void): () => void;
}

export interface HMRGraphMetadata {
  id: string;
  origin: string;
  bundleEntry: string;
  platform: string;
}

export interface HMRGraph extends HMRGraphMetadata {
  runtime: HMRGraphRuntime;
}

export interface HMRGraphRuntime extends DevRuntimeInterface {
  setup(socket: WebSocket, origin: string): void;
}

export interface ModuleGraphDelta {
  ids: string[];
  localCount: number;
  edges: number[][];
  dynamicEdges?: number[][];
}

export interface DevRuntimeHooks {
  createModuleHotContext(moduleId: string): HMRContext;
  onModuleCacheRemoval(moduleId: string): void;
}

export interface DevRuntimeInterface {
  clientId: string;
  hooks: DevRuntimeHooks | null;
  registerGraph(delta: ModuleGraphDelta): void;
  registerFactory(id: string, kind: 'esm' | 'cjs', fn: (id: string) => void): void;
  registerModule(id: string, exportsHolder: { exports: any }): void;
  getImporters(id: string): string[];
  isExecuted(id: string): boolean;
  hasFactory(id: string): boolean;
  removeModuleCache(id: string): void;
  initModule(id: string): unknown;
  loadExports(id: string): unknown;
  createModuleHotContext(moduleId: string): HMRContext;
}

declare class DevRuntime implements DevRuntimeInterface {
  constructor(clientId: string);
  clientId: string;
  hooks: DevRuntimeHooks | null;
  registerGraph(delta: ModuleGraphDelta): void;
  registerFactory(id: string, kind: 'esm' | 'cjs', fn: (id: string) => void): void;
  registerModule(id: string, exportsHolder: { exports: any }): void;
  getImporters(id: string): string[];
  isExecuted(id: string): boolean;
  hasFactory(id: string): boolean;
  removeModuleCache(id: string): void;
  initModule(id: string): unknown;
  loadExports(id: string): unknown;
  createModuleHotContext(moduleId: string): HMRContext;
}

export type { DevRuntime };
