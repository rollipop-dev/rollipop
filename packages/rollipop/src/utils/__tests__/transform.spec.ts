import { RollipopReactNativeTransformer } from '@rollipop/rolldown/experimental';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import { createTestConfig } from '../../testing/config';
import { transformWithRollipop } from '../transform';

vi.mock('@rollipop/rolldown/experimental', () => {
  const RollipopReactNativeTransformer = vi.fn(function (
    this: { transformSync: (id: string, code: string) => { code: string } },
    options: { runtimeTarget: string },
  ) {
    this.transformSync = vi.fn((id: string, code: string) => ({
      code: `[${options.runtimeTarget}] ${id}: ${code}`,
    }));
  });

  return { RollipopReactNativeTransformer };
});

describe('transformWithRollipop', () => {
  beforeEach(() => {
    vi.mocked(RollipopReactNativeTransformer).mockClear();
  });

  it('passes resolved native transformer options', () => {
    const config = createTestConfig('/project');
    config.mode = 'production';
    config.runtimeTarget = 'hermes';

    const result = transformWithRollipop('/polyfill.js', 'const answer = 1;', config);

    expect(result.code).toBe('[hermes] /polyfill.js: const answer = 1;');
    expect(RollipopReactNativeTransformer).toHaveBeenCalledWith({
      envName: 'production',
      runtimeTarget: 'hermes',
      flow: undefined,
      worklets: undefined,
      swc: {
        externalHelpers: false,
      },
    });
  });

  it('reuses the native transformer for the same config object', () => {
    const config = createTestConfig('/project');

    transformWithRollipop('/a.js', 'a();', config);
    transformWithRollipop('/b.js', 'b();', config);

    expect(RollipopReactNativeTransformer).toHaveBeenCalledTimes(1);
    const instance = vi.mocked(RollipopReactNativeTransformer).mock.instances[0] as unknown as {
      transformSync: ReturnType<typeof vi.fn>;
    };
    expect(instance.transformSync).toHaveBeenNthCalledWith(1, '/a.js', 'a();');
    expect(instance.transformSync).toHaveBeenNthCalledWith(2, '/b.js', 'b();');
  });

  it('does not reuse a transformer across config objects', () => {
    const configA = createTestConfig('/project-a');
    const configB = createTestConfig('/project-b');
    configA.runtimeTarget = 'hermes-v1';
    configB.runtimeTarget = 'hermes';

    transformWithRollipop('/a.js', 'a();', configA);
    transformWithRollipop('/b.js', 'b();', configB);

    expect(RollipopReactNativeTransformer).toHaveBeenCalledTimes(2);
    expect(vi.mocked(RollipopReactNativeTransformer).mock.calls[0]![0]).toMatchObject({
      runtimeTarget: 'hermes-v1',
    });
    expect(vi.mocked(RollipopReactNativeTransformer).mock.calls[1]![0]).toMatchObject({
      runtimeTarget: 'hermes',
    });
  });
});
