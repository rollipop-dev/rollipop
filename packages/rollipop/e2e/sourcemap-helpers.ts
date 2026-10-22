import fs from 'node:fs';

import type { OutputChunk } from '@rollipop/rolldown';
import { SourceMapConsumer } from 'source-map';
import { expect } from 'vite-plus/test';

import { Bundler } from '../src/core/bundler';
import { symbolicate } from '../src/server/symbolicate';
import { getErrorStack } from '../src/testing/error-stack';
import { createConfig, fixturePath, type TestConfigOptions } from './helpers';

export async function buildWithReactRefresh(
  fixture: string,
  options: TestConfigOptions = {},
): Promise<OutputChunk> {
  const config = createConfig(fixture, { ...options, mode: 'development' });
  config.dev.hmr = true;
  config.dev.watch.enabled = false;
  let result: OutputChunk | Error | undefined;
  const engine = await Bundler.devEngine(
    config,
    { platform: 'android', cache: false, sourcemap: true },
    {
      host: 'localhost',
      port: 8081,
      bundleEntry: 'index.bundle',
      onOutput(output) {
        result = output instanceof Error ? output : output.output[0];
      },
    },
  );
  try {
    await engine.run();
    if (result instanceof Error) {
      throw result;
    }
    expect(result).toBeDefined();
    return result!;
  } finally {
    await engine.close();
  }
}

export async function expectMappedError(
  chunk: OutputChunk,
  { fixture, source, message }: { fixture: string; source: string; message: string },
  run: () => unknown,
): Promise<void> {
  expect(chunk.map).toBeDefined();
  let thrown: unknown;
  try {
    await run();
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toMatchObject({ message });
  const generated = getErrorStack(thrown);
  expect(generated).not.toBeNull();
  // Minification can turn `new Error(...)` into `Error(...)`.
  const generatedLine = chunk.code.split('\n')[generated!.line - 1];
  const errorExpression = generatedLine
    .slice(generated!.column - 1)
    .match(/^(?:new )?Error(?=\()/)?.[0];
  expect(errorExpression).toBeDefined();

  const originalSource = fs.readFileSync(fixturePath(fixture, source), 'utf8');
  const lines = originalSource.split('\n');
  const throwLine = lines.findIndex((line) => line.includes(`throw new Error('${message}')`));
  expect(throwLine).toBeGreaterThanOrEqual(0);
  const line = throwLine + 1;
  const column = lines[throwLine].indexOf(errorExpression!);

  await SourceMapConsumer.with(chunk.map!.toString(), null, async (consumer) => {
    // V8 stack columns are one-based; source map columns are zero-based.
    const generatedColumn = generated!.column - 1;
    expect(
      consumer.originalPositionFor({ line: generated!.line, column: generatedColumn }),
    ).toMatchObject({ source, line, column });
    expect(consumer.sourceContentFor(source)).toBe(originalSource);

    const result = await symbolicate(
      {
        bundleFilePath: 'index.bundle',
        code: chunk.code,
        sourceMap: chunk.map!.toString(),
        sourceMapConsumer: Promise.resolve(consumer),
      },
      [
        {
          file: 'http://localhost:8081/index.bundle',
          lineNumber: generated!.line,
          column: generatedColumn,
        },
      ],
    );
    expect(result.stack[0]).toMatchObject({ file: source, lineNumber: line, column });
    expect(result.codeFrame).toMatchObject({
      fileName: source,
      location: { row: line, column },
    });
  });
}
