import { SourceMapConsumer, SourceMapGenerator } from 'source-map';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import type { BundleStore } from '../bundle';
import { type StackFrameInput, symbolicate } from '../symbolicate';

function createMockSourceMapConsumer(mappings: Map<string, any>) {
  return {
    originalPositionFor: vi.fn(({ line, column }) => {
      const key = `${line}:${column}`;
      return (
        mappings.get(key) ?? {
          source: null,
          line: null,
          column: null,
          name: null,
        }
      );
    }),
    sourceContentFor: vi.fn().mockReturnValue('const x = 1;\nconst y = 2;'),
  };
}

function createMockBundleStore(sourceMapConsumer: any, code = 'var x = 1;'): BundleStore {
  return {
    bundleFilePath: '/tmp/index.bundle',
    code,
    sourceMap: '{}',
    sourceMapConsumer: Promise.resolve(sourceMapConsumer),
  };
}

describe('symbolicate', () => {
  it('should symbolicate stack frames using source map', async () => {
    const mappings = new Map([
      [
        '10:20',
        {
          source: 'src/App.tsx',
          line: 5,
          column: 10,
          name: 'handlePress',
        },
      ],
    ]);

    const consumer = createMockSourceMapConsumer(mappings);
    const bundleStore = createMockBundleStore(consumer);

    const stack: StackFrameInput[] = [
      { file: 'http://localhost:8081/index.bundle', lineNumber: 10, column: 20 },
    ];

    const result = await symbolicate(bundleStore, stack);

    expect(result.stack[0]).toMatchObject({
      file: 'src/App.tsx',
      lineNumber: 5,
      column: 10,
      methodName: 'handlePress',
    });
  });

  it('should preserve non-http frames', async () => {
    const consumer = createMockSourceMapConsumer(new Map());
    const bundleStore = createMockBundleStore(consumer);

    const stack: StackFrameInput[] = [
      { file: '/local/path/file.js', lineNumber: 1, column: 0 },
      { file: 'http://localhost:8081/index.bundle', lineNumber: 1, column: 0 },
    ];

    const result = await symbolicate(bundleStore, stack);

    expect(result.stack).toHaveLength(2);
    expect(result.stack[0]).toMatchObject({
      file: '/local/path/file.js',
      lineNumber: 1,
      column: 0,
    });
    expect(result.stack[1]).toMatchObject({
      file: 'http://localhost:8081/index.bundle',
      lineNumber: 1,
      column: 0,
    });
  });

  it('should preserve zero-valued original positions', async () => {
    const mappings = new Map([
      [
        '10:20',
        {
          source: 'src/App.tsx',
          line: 1,
          column: 0,
          name: null,
        },
      ],
    ]);

    const consumer = createMockSourceMapConsumer(mappings);
    const bundleStore = createMockBundleStore(consumer);

    const stack: StackFrameInput[] = [
      { file: 'http://localhost:8081/index.bundle', lineNumber: 10, column: 20 },
    ];

    const result = await symbolicate(bundleStore, stack);

    expect(result.stack[0]).toMatchObject({
      file: 'src/App.tsx',
      lineNumber: 1,
      column: 0,
    });
  });

  it('should collapse internal React Native frames', async () => {
    const mappings = new Map([
      [
        '1:0',
        {
          source: '/node_modules/react-native/Libraries/Core/Timers.js',
          line: 1,
          column: 0,
          name: null,
        },
      ],
      [
        '2:0',
        {
          source: 'src/App.tsx',
          line: 1,
          column: 0,
          name: null,
        },
      ],
    ]);

    const consumer = createMockSourceMapConsumer(mappings);
    const bundleStore = createMockBundleStore(consumer);

    const stack: StackFrameInput[] = [
      { file: 'http://localhost:8081/index.bundle', lineNumber: 1, column: 0 },
      { file: 'http://localhost:8081/index.bundle', lineNumber: 2, column: 0 },
    ];

    const result = await symbolicate(bundleStore, stack);

    expect(result.stack[0].collapse).toBe(true);
    expect(result.stack[1].collapse).toBe(false);
  });

  it('should preserve frame when column or lineNumber is missing', async () => {
    const consumer = createMockSourceMapConsumer(new Map());
    const bundleStore = createMockBundleStore(consumer);

    const stack: StackFrameInput[] = [
      { file: 'http://localhost:8081/index.bundle', lineNumber: undefined, column: undefined },
    ];

    const result = await symbolicate(bundleStore, stack);

    expect(consumer.originalPositionFor).not.toHaveBeenCalled();
    expect(result.stack[0].file).toBe('http://localhost:8081/index.bundle');
  });

  it('should return null codeFrame when no non-collapsed frame exists', async () => {
    const mappings = new Map([
      [
        '1:0',
        {
          source: '/node_modules/react-native/Libraries/Core/Timers.js',
          line: 1,
          column: 0,
          name: null,
        },
      ],
    ]);

    const consumer = createMockSourceMapConsumer(mappings);
    const bundleStore = createMockBundleStore(consumer);

    const stack: StackFrameInput[] = [
      { file: 'http://localhost:8081/index.bundle', lineNumber: 1, column: 0 },
    ];

    const result = await symbolicate(bundleStore, stack);

    expect(result.codeFrame).toBeNull();
  });

  it('should work without source map consumer', async () => {
    const bundleStore: BundleStore = {
      bundleFilePath: '/tmp/index.bundle',
      code: 'var x = 1;',
      sourceMap: undefined,
      sourceMapConsumer: Promise.resolve(undefined as any),
    };

    const stack: StackFrameInput[] = [
      { file: 'http://localhost:8081/index.bundle', lineNumber: 1, column: 0 },
    ];

    const result = await symbolicate(bundleStore, stack);

    expect(result.stack[0].file).toBe('http://localhost:8081/index.bundle');
  });
});

describe('dashboard position inspection', () => {
  const file = 'http://localhost:8081/hot/ios-dev/hmr_patch_0.js';
  let consumer: SourceMapConsumer;
  let bundle: BundleStore;

  beforeEach(async () => {
    const generated = Array<string>(96).fill('');
    generated[0] = '(function (__rolldown_runtime__) {';
    generated[29] = '\t\tvar _s = $RefreshSig$();';
    generated[30] = '\t\tvar breathe = { to: { transform: [{ scale: 1.06 }] } };';
    generated[94] = '\t\t\t\t\t\tchildren: "Rollipop !"';
    generated[95] = '})(runtime);';
    const original = Array<string>(52).fill('');
    original[12] = 'const breathe = { to: { transform: [{ scale: 1.06 }] } };';
    original[51] = '          <Text style={styles.title}>Rollipop !</Text>';
    const map = new SourceMapGenerator({ file: 'hmr_patch_0.js' });
    for (const [line, column, sourceLine, sourceColumn] of [
      [31, 2, 13, 0],
      [31, 6, 13, 6],
      [95, 16, 52, 37],
    ]) {
      map.addMapping({
        generated: { line, column },
        original: { line: sourceLine, column: sourceColumn },
        source: 'src/screens/HomeScreen.tsx',
      });
    }
    map.setSourceContent('src/screens/HomeScreen.tsx', original.join('\n'));
    consumer = await new SourceMapConsumer(map.toString());
    bundle = createMockBundleStore(consumer, generated.join('\n'));
  });

  afterEach(() => consumer.destroy());

  it.each([
    { name: 'indentation', line: 31, column: 0, sourceLine: 13, sourceColumn: 0 },
    { name: 'generated property prefix', line: 95, column: 0, sourceLine: 52, sourceColumn: 37 },
    { name: 'exact mapping', line: 31, column: 6, sourceLine: 13, sourceColumn: 6 },
    { name: 'existing lower-bound mapping', line: 31, column: 4, sourceLine: 13, sourceColumn: 0 },
  ])(
    'resolves $name without changing existing mapped positions',
    async ({ line, column, sourceLine, sourceColumn }) => {
      const result = await symbolicate(bundle, [{ file, lineNumber: line, column }], {
        fallbackToNextMapping: true,
      });

      expect(result.stack[0]).toMatchObject({
        file: 'src/screens/HomeScreen.tsx',
        lineNumber: sourceLine,
        column: sourceColumn,
      });
      expect(result.codeFrame).toMatchObject({
        fileName: 'src/screens/HomeScreen.tsx',
        location: { row: sourceLine, column: sourceColumn },
      });
    },
  );

  it.each([1, 30, 94])('does not use a later line for unmapped generated line %s', async (line) => {
    const frame = { file, lineNumber: line, column: 0 };
    const result = await symbolicate(bundle, [frame], { fallbackToNextMapping: true });

    expect(result.stack[0]).toMatchObject(frame);
  });

  it.each([31, 95])('preserves default runtime lookup on generated line %s', async (line) => {
    const frame = { file, lineNumber: line, column: 0 };
    const result = await symbolicate(bundle, [frame]);

    expect(result.stack[0]).toMatchObject(frame);
    expect(result.codeFrame?.fileName).toBe('/hot/ios-dev/hmr_patch_0.js');
  });
});
