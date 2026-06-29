import { codeFrameColumns } from '@babel/code-frame';
import { NullableMappedPosition, SourceMapConsumer } from 'source-map';

import { parseUrl } from '../utils/url';
import type { BundleStore } from './bundle';

export interface StackFrameInput {
  file?: string;
  lineNumber?: number;
  column?: number;
  methodName?: string;
}

export type StackFrameOutput = Readonly<IntermediateStackFrame>;

export interface IntermediateStackFrame extends StackFrameInput {
  collapse?: boolean;
}

export interface CodeFrame {
  content: string;
  location: {
    column: number;
    row: number;
  };
  fileName: string;
}

export interface SymbolicateResult {
  stack: StackFrameOutput[];
  codeFrame: CodeFrame | null;
}

type BundleStoreResolver = (
  frame: StackFrameInput,
) => BundleStore | undefined | Promise<BundleStore | undefined>;

/**
 * @see https://github.com/facebook/react-native/blob/0.83-stable/packages/metro-config/src/index.flow.js#L17
 */
const INTERNAL_CALLSITES_REGEX = new RegExp(
  [
    '/Libraries/BatchedBridge/MessageQueue\\.js$',
    '/Libraries/Core/.+\\.js$',
    '/Libraries/LogBox/.+\\.js$',
    '/Libraries/Network/.+\\.js$',
    '/Libraries/Pressability/.+\\.js$',
    '/Libraries/Renderer/implementations/.+\\.js$',
    '/Libraries/Utilities/.+\\.js$',
    '/Libraries/vendor/.+\\.js$',
    '/Libraries/WebSocket/.+\\.js$',
    '/src/private/renderer/errorhandling/.+\\.js$',
    '/metro-runtime/.+\\.js$',
    '/node_modules/@babel/runtime/.+\\.js$',
    '/node_modules/@react-native/js-polyfills/.+\\.js$',
    '/node_modules/invariant/.+\\.js$',
    '/node_modules/react-devtools-core/.+\\.js$',
    '/node_modules/react-native/index.js$',
    '/node_modules/react-refresh/.+\\.js$',
    '/node_modules/scheduler/.+\\.js$',
    '^\\[native code\\]$',
  ]
    // Make patterns work with both Windows and POSIX paths.
    .map((pathPattern) => pathPattern.replaceAll('/', '[/\\\\]'))
    .join('|'),
);

export async function symbolicate(
  bundleStore: BundleStore,
  stack: StackFrameInput[],
): Promise<SymbolicateResult> {
  return symbolicateWithBundleResolver(stack, (frame) =>
    frame.file?.startsWith('http') ? bundleStore : undefined,
  );
}

export async function symbolicateWithBundleResolver(
  stack: StackFrameInput[],
  resolveBundleStore: BundleStoreResolver,
): Promise<SymbolicateResult> {
  const symbolicatedStack = await Promise.all(
    stack.map(async (frame) => {
      const bundleStore = frame.file?.startsWith('http')
        ? await resolveBundleStore(frame)
        : undefined;
      const sourceMapConsumer = await bundleStore?.sourceMapConsumer;
      const symbolicatedFrame = sourceMapConsumer
        ? originalPositionFor(sourceMapConsumer, frame)
        : frame;

      return {
        bundleStore,
        frame: collapseFrame(symbolicatedFrame),
        sourceMapConsumer,
      };
    }),
  );

  const stackFrames = symbolicatedStack.map(({ frame }) => frame);
  return {
    stack: stackFrames,
    codeFrame: getCodeFrame(symbolicatedStack),
  };
}

function originalPositionFor(sourceMapConsumer: SourceMapConsumer, frame: StackFrameInput) {
  if (frame.column == null || frame.lineNumber == null) {
    return frame;
  }

  const originalPosition = sourceMapConsumer.originalPositionFor({
    column: frame.column,
    line: frame.lineNumber,
  });

  return Object.entries(originalPosition).reduce((frame, [key, value]) => {
    const targetKey = convertFrameKey(key as keyof typeof originalPosition);
    return {
      ...frame,
      ...(value != null ? { [targetKey]: value } : null),
    };
  }, frame);
}

function collapseFrame(frame: StackFrameInput): StackFrameOutput {
  return {
    ...frame,
    collapse: Boolean(frame.file && INTERNAL_CALLSITES_REGEX.test(frame.file)),
  };
}

function isCollapsed(frame: StackFrameInput) {
  return ('collapse' in frame && frame.collapse) as boolean;
}

function convertFrameKey(key: keyof NullableMappedPosition): keyof StackFrameInput {
  if (key === 'line') {
    return 'lineNumber';
  } else if (key === 'source') {
    return 'file';
  } else if (key === 'name') {
    return 'methodName';
  }
  return key;
}

interface SymbolicatedStackFrame {
  bundleStore?: BundleStore;
  frame: StackFrameOutput;
  sourceMapConsumer?: SourceMapConsumer;
}

function getCodeFrame(frames: SymbolicatedStackFrame[]): CodeFrame | null {
  for (const match of frames) {
    const frame = match.frame;

    if (frame.file == null || frame.column == null || frame.lineNumber == null) {
      continue;
    }

    if (isCollapsed(frame)) {
      continue;
    }

    const codeFrame = createCodeFrame(match);
    if (codeFrame != null) {
      return codeFrame;
    }
  }

  return null;
}

function createCodeFrame({
  bundleStore,
  frame,
  sourceMapConsumer,
}: SymbolicatedStackFrame): CodeFrame | null {
  try {
    const { lineNumber, column, file } = frame;
    if (file == null || lineNumber == null || column == null) {
      return null;
    }

    const unresolved = file?.startsWith('http') ?? false;
    const source =
      sourceMapConsumer == null || unresolved
        ? bundleStore?.code
        : sourceMapConsumer.sourceContentFor(file, true);

    if (!source) {
      return null;
    }

    const fileName = unresolved ? (parseUrl(file).pathname ?? 'unknown') : file;
    const content = codeFrameColumns(
      source,
      {
        start: { column: column + 1, line: lineNumber },
      },
      { highlightCode: true },
    );

    return {
      content,
      fileName,
      location: { column, row: lineNumber },
    };
  } catch {
    return null;
  }
}
