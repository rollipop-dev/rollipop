'use strict';

import sloppy from './sloppy.js';
import strict from './strict.js';

globalThis.result = [
  (function () {
    return this === undefined;
  })(),
  sloppy(),
  strict(),
  typeof import.meta,
  import.meta.url === undefined,
  import.meta.unknown === undefined,
  import.meta.hot === undefined,
];
