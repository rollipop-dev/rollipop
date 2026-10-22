async function failAfterAwait(value: string): Promise<void> {
  await Promise.resolve(value);
  throw new Error('async failure');
}

globalThis.runSourcemapCase = () => failAfterAwait('test');
