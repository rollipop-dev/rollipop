// oxlint-disable no-non-null-asserted-optional-chain
import { codeFrameColumns } from '@babel/code-frame';
import dedent from 'dedent';
import { SourceMapConsumer } from 'source-map';
import { describe, it, expect } from 'vite-plus/test';

import { getErrorStack } from '../../testing/error-stack';
import { evaluateContext } from '../../testing/evaluate-context';
import { stripFlowTypes } from '../transformer';

describe('stripFlowTypes', () => {
  const FLOW_1 = dedent`
  // @flow
  const values: ReadonlyArray<?number> = [1, 2, 3, null, 4, 5];

  function calculate(values: ReadonlyArray<mixed>): number {
    return values.filter(Boolean).reduce((acc, value) => acc + value, 0);
  }

  assert(calculate(values) === 15);
  `;

  const FLOW_2 = dedent`
  // @flow
  function boom() {
    if (false) {
      console.log('no boom');
    } else {
      throw new Error('boom');
    }
  }
  boom();
  `;

  it('should strip Flow syntax', async () => {
    const { code, map } = await stripFlowTypes('test.js', FLOW_1);
    const { evaluate } = evaluateContext();
    expect(code).not.toContain('@flow');
    expect(() => evaluate(code)).not.toThrow();
    expect(map?.sources).toContain('test.js');
  });

  it('should return the correct source map', async () => {
    const { code, map } = await stripFlowTypes('test.js', FLOW_2);
    const { evaluate } = evaluateContext();
    const consumer = await new SourceMapConsumer(map!);

    let errorStack: ReturnType<typeof getErrorStack> | null = null;
    try {
      evaluate(code);
    } catch (error) {
      errorStack = getErrorStack(error);
    }

    expect(errorStack).toBeTruthy();

    const originalPosition = consumer.originalPositionFor({
      line: errorStack?.line!,
      column: errorStack?.column!,
    });

    expect(originalPosition.column).toBeDefined();
    expect(originalPosition.line).toBeDefined();

    const codeFrame = codeFrameColumns(
      FLOW_2,
      {
        start: {
          line: originalPosition.line!,
          column: originalPosition.column!,
        },
      },
      { highlightCode: false },
    );

    expect(codeFrame).toMatchInlineSnapshot(`
      "  4 |     console.log('no boom');
        5 |   } else {
      > 6 |     throw new Error('boom');
          |           ^
        7 |   }
        8 | }
        9 | boom();"
    `);
  });
});
