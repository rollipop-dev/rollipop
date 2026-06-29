import { describe, expect, it, vi } from 'vite-plus/test';

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
