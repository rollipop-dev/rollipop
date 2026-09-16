import fn, { Constructor, object } from './dep.js';
import * as namespace from './dep.js';
import { arrow, receiver, top } from './esm.js';

const commonjs = require('./commonjs.cjs');

globalThis.result = [
  fn() === undefined,
  fn?.() === undefined,
  fn`tag` === undefined,
  namespace.default() === namespace,
  namespace.default?.() === namespace,
  namespace.default`tag` === namespace,
  object.method() === object,
  new Constructor().value,
  top === undefined,
  arrow() === undefined,
  receiver.call(42) === 42,
  commonjs.top === commonjs,
  commonjs.arrow() === commonjs,
  (0, commonjs.sloppy)() === globalThis,
];
