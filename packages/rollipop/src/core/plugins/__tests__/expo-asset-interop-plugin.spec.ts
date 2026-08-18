import { describe, expect, it } from 'vite-plus/test';

import { expoAssetInterop, RESOLVE_ASSET_SOURCE_RE } from '../expo-asset-interop-plugin';

describe('expoAssetInterop', () => {
  describe('plugin gating', () => {
    it('returns null when disabled (not the Expo bundler)', () => {
      expect(expoAssetInterop({ enabled: false })).toBeNull();
    });

    it('returns a plugin with a load hook when enabled', () => {
      const plugin = expoAssetInterop({ enabled: true });
      expect(plugin).not.toBeNull();
      expect(plugin!.load).toBeDefined();
    });
  });

  describe('load hook shim (MISSING_EXPORT fix)', () => {
    it('re-exports setCustomSourceTransformer as a named export so Asset.fx.js resolves', () => {
      const plugin = expoAssetInterop({ enabled: true });
      const result = (
        plugin!.load as { handler: (id: string) => { code: string; moduleType: string } }
      ).handler('/abs/path/expo/packages/expo-asset/build/resolveAssetSource.native.js');

      expect(result.moduleType).toBe('js');
      // Default export preserved (Image still resolves the source transform fn).
      expect(result.code).toContain(
        "import resolveAssetSource from 'react-native/Libraries/Image/resolveAssetSource'",
      );
      expect(result.code).toContain('export default resolveAssetSource;');
      // The property that `export *` does not forward becomes an explicit named export.
      expect(result.code).toContain(
        'export const setCustomSourceTransformer = resolveAssetSource?.setCustomSourceTransformer;',
      );
      // Must NOT import itself (the self-referential default interop bug).
      expect(result.code).not.toContain("from './resolveAssetSource'");
      expect(result.code).not.toContain('from "./resolveAssetSource"');
    });
  });

  describe('RESOLVE_ASSET_SOURCE_RE filter', () => {
    it('matches expo-asset resolveAssetSource (native + base)', () => {
      expect(RESOLVE_ASSET_SOURCE_RE.test('/x/expo-asset/build/resolveAssetSource.native.js')).toBe(
        true,
      );
      expect(RESOLVE_ASSET_SOURCE_RE.test('/x/expo-asset/build/resolveAssetSource.js')).toBe(true);
    });

    it('does NOT match React Native core resolveAssetSource', () => {
      expect(
        RESOLVE_ASSET_SOURCE_RE.test('/x/react-native/Libraries/Image/resolveAssetSource.js'),
      ).toBe(false);
    });
  });
});
