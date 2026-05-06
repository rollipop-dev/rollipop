import MagicString from 'magic-string';

import { VIRTUAL_HOST_INIT_ID } from '../constants';

export function transformHostEntry(code: string, id: string) {
  const magicString = new MagicString(code);
  magicString.prepend(`import ${JSON.stringify(VIRTUAL_HOST_INIT_ID)};\n`);

  return {
    code: magicString.toString(),
    map: magicString.generateMap({ hires: true, source: id }),
  };
}
