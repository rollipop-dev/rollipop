import { interpreter } from '@rollipop/rolldown/filter';
import { describe, expect, it } from 'vite-plus/test';

import { expoAssetInterop } from '../expo-asset-interop-plugin';

type Filter = Parameters<typeof interpreter>[0];

describe('expo-asset-interop plugin', () => {
  it('is a no-op when disabled', () => {
    expect(expoAssetInterop({ enabled: false })).toBeNull();
  });

  it('re-exports setCustomSourceTransformer as a named export', () => {
    const plugin = expoAssetInterop({ enabled: true })!;
    const transform = plugin.transform as {
      filter: Filter;
      handler: () => { code: string; moduleType: string };
    };

    const result = transform.handler();

    expect(result.moduleType).toBe('js');
    expect(result.code).toContain(
      "import resolveAssetSource from 'react-native/Libraries/Image/resolveAssetSource';",
    );
    expect(result.code).toContain('export default resolveAssetSource;');
    expect(result.code).toContain(
      'export const setCustomSourceTransformer = resolveAssetSource?.setCustomSourceTransformer;',
    );
  });

  it('filters resolveAssetSource module variants', () => {
    const plugin = expoAssetInterop({ enabled: true })!;
    const transform = plugin.transform as { filter: Filter; handler: () => unknown };

    const base = '/store/expo-asset/build/resolveAssetSource.js';
    const native = '/store/expo-asset/build/resolveAssetSource.native.js';
    const unrelated = '/store/expo-asset/build/Asset.js';

    expect(interpreter(transform.filter, undefined, base)).toBe(true);
    expect(interpreter(transform.filter, undefined, native)).toBe(true);
    expect(interpreter(transform.filter, undefined, unrelated)).toBe(false);
  });
});
