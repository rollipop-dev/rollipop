declare const __SOURCEMAP_RULE__: string;
declare function recordTransform(value: string): void;

function failWithChainedTransforms(): void {
  const marker: string = __SOURCEMAP_RULE__;
  recordTransform(marker);
  throw new Error('chained transform failure');
}

globalThis.runSourcemapCase = failWithChainedTransforms;
