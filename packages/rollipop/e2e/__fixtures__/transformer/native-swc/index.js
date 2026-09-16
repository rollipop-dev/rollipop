console.log('global-log');
console.warn('global-warn');
console.error('global-error');

function logLocally(console) {
  console.log('local-log');
}

logLocally({ log: (value) => record(value) });
record('retained-side-effect');
record(__NATIVE_SWC_RULE__);
