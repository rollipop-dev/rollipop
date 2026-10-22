// @flow
type Options = {
  enabled: boolean,
};

function failWithFlow(options: Options): void {
  if (options.enabled) {
    throw new Error('Flow failure');
  }
}

globalThis.runSourcemapCase = () => failWithFlow({ enabled: true });
