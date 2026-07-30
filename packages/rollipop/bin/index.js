#!/usr/bin/env node

import module from 'node:module';

if (typeof module.enableCompileCache === 'function') {
  // Available in Node.js >=22.8.0
  module.enableCompileCache();
}

(await import('../dist/index.js')).cli.run(process.argv);
