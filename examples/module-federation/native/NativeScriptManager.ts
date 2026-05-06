import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface ScriptLocator {
  url: string;
  parentUrl: string | null;
}

export interface Spec extends TurboModule {
  loadScript(scriptId: string, config: ScriptLocator): Promise<void>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('ScriptManager');
