import type * as rolldown from '@rollipop/rolldown';
import { viteImportGlobPlugin as importGlob } from '@rollipop/rolldown/experimental';

export interface ImportGlobPluginOptions {
  root?: string;
  sourcemap?: boolean;
  restoreQueryExtension?: boolean;
}

function importGlobPlugin(options: ImportGlobPluginOptions): rolldown.Plugin {
  return importGlob(options);
}

export { importGlobPlugin as importGlob };
