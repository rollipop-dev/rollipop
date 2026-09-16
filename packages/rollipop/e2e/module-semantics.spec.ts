import { describe, expect, it } from 'vite-plus/test';

import { evaluateContext } from '../src/testing/evaluate-context';
import { build } from './helpers';

async function buildAndEvaluate(
  fixture: string,
  context: Record<string, unknown> = {},
  entry = 'index.js',
) {
  const chunk = await build(`module-semantics/${fixture}`, { entry });
  const result = await evaluateContext(context).evaluate(`${chunk.code}\nglobalThis.result;`);

  return JSON.parse(JSON.stringify(result));
}

describe('module semantics', () => {
  it('preserves call receivers and top-level this semantics', async () => {
    await expect(buildAndEvaluate('call-receivers')).resolves.toEqual([
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      42,
      true,
      true,
      true,
      true,
      true,
      true,
    ]);
  });

  it('preserves tree-shaken namespace and barrel re-exports', async () => {
    await expect(buildAndEvaluate('reexports', { seed: 7 })).resolves.toEqual([
      ['increment', 'value'],
      2,
      true,
      2,
      true,
      42,
      2,
      7,
      'default-value',
      42,
      42,
    ]);
  });

  it('preserves default, named, mutable, and CommonJS JSON imports', async () => {
    await expect(buildAndEvaluate('json-imports')).resolves.toEqual({
      split: 'split-name',
      splitNested: 42,
      name: 'package-name',
      version: '1.2.3',
      nested: 42,
      quoted: true,
      defaultField: 'field',
      missing: true,
      mutable: 2,
      array: [1, 2, 3],
      primitive: 42,
    });
  });

  it('preserves dynamic CommonJS interop and evaluation order', async () => {
    await expect(buildAndEvaluate('dynamic-cjs')).resolves.toEqual({
      answer: 42,
      named: 42,
      events: ['sync', 'module'],
      babel: 'babel-default',
      node: 'babel-default',
      nodeNamed: 'named',
    });
  });

  it('preserves strict directives and production import.meta semantics', async () => {
    await expect(buildAndEvaluate('strict-import-meta')).resolves.toEqual([
      true,
      false,
      true,
      'object',
      true,
      true,
      true,
    ]);
  });
});
