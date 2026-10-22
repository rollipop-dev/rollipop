function failInPlainJavaScript(value) {
  if (value === 'test') {
    throw new Error('plain JavaScript failure');
  }
}

globalThis.runSourcemapCase = () => failInPlainJavaScript('test');
