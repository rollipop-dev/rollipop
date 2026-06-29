import chalk from 'chalk';
import fp from 'fastify-plugin';
import { asConst, type FromSchema } from 'json-schema-to-ts';

import { isDebugEnabled } from '../../common/env';
import { getBaseBundleName } from '../../utils/bundle';
import { parseUrl, type Query } from '../../utils/url';
import type { BundleStore } from '../bundle';
import type { StackFrameInput } from '../symbolicate';
import { symbolicateWithBundleResolver, type SymbolicateResult } from '../symbolicate';
import type { DevServerContext } from '../types';

const bodySchema = asConst({
  type: 'object',
  properties: {
    stack: {
      type: 'array',
      items: {},
    },
    extraData: {},
  },
  required: ['stack'],
});

type Body = FromSchema<typeof bodySchema>;

interface SymbolicateRequestBody {
  stack: StackFrameInput[];
  extraData: Record<string, unknown>;
}

interface ParsedBundleUrl {
  pathname: string;
  query: Query;
}

export interface SymbolicatePluginOptions {
  context: DevServerContext;
}

const plugin = fp<SymbolicatePluginOptions>(
  (fastify, options) => {
    const { context } = options;

    fastify.post<{ Body: Body }>('/symbolicate', {
      schema: {
        body: bodySchema,
      },
      async handler(request, reply) {
        const { stack } = request.body as SymbolicateRequestBody;

        const bundleStores = getBundleStoresByFrameUrl(stack, context);
        if (bundleStores.size === 0) {
          await reply.header('Content-Type', 'application/json').send(createFallbackResult(stack));
          return;
        }

        const symbolicateResult = await symbolicateWithBundleResolver(stack, async (frame) =>
          frame.file == null ? undefined : await bundleStores.get(frame.file),
        );

        if (isDebugEnabled()) {
          printSymbolicateResult(stack, symbolicateResult);
        }

        await reply.header('Content-Type', 'application/json').send(symbolicateResult);
      },
    });
  },
  { name: 'symbolicate' },
);

function getBundleStoresByFrameUrl(
  stack: StackFrameInput[],
  context: DevServerContext,
): Map<string, Promise<BundleStore>> {
  const bundleStores = new Map<string, Promise<BundleStore>>();

  for (const frame of stack) {
    const file = frame.file;
    if (!file?.startsWith('http') || bundleStores.has(file)) {
      continue;
    }

    const parsed = parseStackFrameFile(file);
    if (parsed?.query.platform == null) {
      continue;
    }

    const { pathname, query } = parsed;
    const platform = query.platform;
    const dev = query.dev == null ? context.config.mode === 'development' : query.dev === 'true';
    const bundleName = getBaseBundleName(pathname);
    const bundler = context.bundlerPool.get(bundleName, { platform, dev });
    bundleStores.set(file, bundler.getBundle());
  }

  return bundleStores;
}

function parseStackFrameFile(file: string): ParsedBundleUrl | null {
  try {
    const { pathname, query } = parseUrl(file);
    return pathname ? { pathname, query } : null;
  } catch {
    return null;
  }
}

function createFallbackResult(stack: StackFrameInput[]): SymbolicateResult {
  return {
    stack: stack.map((frame) => ({ ...frame })),
    codeFrame: null,
  };
}

function printSymbolicateResult(
  rawStackFrame: StackFrameInput[],
  symbolicateResult: SymbolicateResult,
) {
  console.log();
  console.log('Symbolicate result:');
  console.log();

  if (symbolicateResult.codeFrame != null) {
    console.log(symbolicateResult.codeFrame.content);
    console.log();
  }

  console.log('Stack trace:');
  symbolicateResult.stack.forEach((stackFrame) => {
    const symbol = stackFrame.methodName ?? '<anonymous>';
    const file = stackFrame.file ?? 'unknown';
    const location =
      stackFrame.lineNumber != null && stackFrame.column != null
        ? `(${chalk.gray.underline(`${file}:${stackFrame.lineNumber}:${stackFrame.column}`)})`
        : '';

    console.log(`  at ${symbol} ${location}`);
  });

  console.log();
  console.log('Raw stack trace:');
  rawStackFrame
    .filter((stackFrame) => stackFrame.file?.startsWith('http'))
    .forEach((stackFrame) => {
      const url = new URL(stackFrame.file!);
      const bundleName = url.pathname.slice(1);
      const symbol = stackFrame.methodName ?? '<anonymous>';
      const location =
        stackFrame.lineNumber != null && stackFrame.column != null
          ? `(${chalk.gray.underline(`${bundleName}:${stackFrame.lineNumber}:${stackFrame.column}`)})`
          : '';
      console.log(`  at ${symbol} ${location}`);
    });

  console.log();
}

export { plugin as symbolicate };
