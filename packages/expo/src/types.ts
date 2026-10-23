import type { ExpoConfig } from 'expo/config';
import type { AssetUtils } from 'rollipop';

export type RollipopAPI = typeof import('rollipop');
export type AppConfig = Partial<ExpoConfig>;
export type BuildMode = 'development' | 'production';

export interface NativeExportOptions {
  platform: string;
  mainModuleName: string;
  mode: BuildMode;
  minify?: boolean;
  bytecode?: boolean;
  serializerIncludeMaps?: boolean;
  inlineSourceMap?: boolean;
}

export interface NativeExportExtra {
  sourceMapUrl?: string;
}

export interface ExpoAsset extends AssetUtils.AssetData {
  fileHashes: string[];
}

export interface NativeExportResult {
  artifacts: {
    type: 'js' | 'map';
    filename: string;
    source: string | Buffer;
    metadata: Record<string, never>;
  }[];
  assets: ExpoAsset[];
}

export interface UpdatesBuildOptions {
  platform: string;
  entryFile?: string;
  dev?: boolean;
}

export type BuildUpdatesAssets = (options: UpdatesBuildOptions) => Promise<ExpoAsset[]>;
