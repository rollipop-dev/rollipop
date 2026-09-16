import nodeImport from './node.mjs';

globalThis.events = [];
const pending = import('./dep.cjs');
globalThis.events.push('sync');

globalThis.result = Promise.all([pending, import('./babel.cjs'), nodeImport()]).then(
  ([namespace, babel, node]) => ({
    answer: namespace.default.answer,
    named: namespace.answer,
    events: globalThis.events,
    babel: babel.default,
    node: node.default.default,
    nodeNamed: node.named,
  }),
);
