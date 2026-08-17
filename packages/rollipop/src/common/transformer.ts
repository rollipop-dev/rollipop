import transform from 'fast-flow-transform';

export async function stripFlowTypes(id: string, code: string) {
  try {
    const result = await transform({
      filename: id,
      source: code,
      sourcemap: true,
      dialect: 'flow',
      format: 'pretty',
    });

    return result;
  } catch {
    // `fast-flow-transform` can be invoked more than once on the same module
    // (e.g. when a later transform pass re-feeds already-stripped code in the
    // dev server's transform pipeline). If the input is already Flow-free the
    // native parser has nothing to do, so we return it untouched rather than
    // failing the whole bundle on a redundant second pass.
    return { code, map: null };
  }
}
