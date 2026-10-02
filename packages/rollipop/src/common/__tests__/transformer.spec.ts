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

  const FLOW_READONLY_INTERFACE = dedent`
  // @flow
  interface Spec {
    readonly now: () => number;
  }

  const spec: Spec = {now: () => 1};
  assert(spec.now() === 1);
  `;

  it('should strip Flow syntax', async () => {
    const { code, map } = await stripFlowTypes('test.js', FLOW_1);
    const { evaluate } = evaluateContext();
    expect(code).not.toContain('@flow');
    expect(() => evaluate(code)).not.toThrow();
    expect(map?.sources).toContain('test.js');
  });

  it('should strip readonly Flow interface syntax', async () => {
    const { code, map } = await stripFlowTypes('test.js', FLOW_READONLY_INTERFACE);
    const { evaluate } = evaluateContext();
    expect(code).not.toContain('interface Spec');
    expect(() => evaluate(code)).not.toThrow();
    expect(map?.sources).toContain('test.js');
  });

  it('allows an SWC fallback result with empty code', async () => {
    const { code, map } = await stripFlowTypes(
      'types.js',
      dedent`
      // @flow
      interface Spec { readonly now: () => number }
      `,
    );
    expect(code.trim()).toBe('');
    expect(map?.mappings).toBe('');
  });

  it('lowers Flow match patterns with leading pipes in the SWC fallback', async () => {
    const { code } = await stripFlowTypes(
      'match.js',
      dedent`
      // @flow
      interface Spec { readonly now: () => number }
      function classify(value: number): string {
        return match (value) {
          | 1 => 'one',
          | _ => 'other',
        };
      }
      assert(classify(1) === 'one');
      assert(classify(2) === 'other');
      `,
    );
    const { evaluate } = evaluateContext();
    expect(() => evaluate(code)).not.toThrow();
  });

  it('preserves original error locations in the SWC fallback source map', async () => {
    const source = dedent`
      // @flow
      interface Spec { readonly now: () => number }
      function boom(): void {
        throw new Error('boom');
      }
      boom();
    `;
    const { code, map } = await stripFlowTypes('fallback.js', source);
    const { evaluate } = evaluateContext();
    const consumer = await new SourceMapConsumer(map!);

    let errorStack: ReturnType<typeof getErrorStack> | null = null;
    try {
      evaluate(code);
    } catch (error) {
      errorStack = getErrorStack(error);
    }

    expect(errorStack).toBeTruthy();
    expect(
      consumer.originalPositionFor({ line: errorStack?.line!, column: errorStack?.column! }),
    ).toMatchObject({ source: 'fallback.js', line: 4 });
    consumer.destroy();
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
