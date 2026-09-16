type Logger = { log(value: string): void };

console.log('global-log');
console.warn('global-warn');
console.error('global-error');

function logLocally(console: Logger): void {
  console.log('local-log');
}

logLocally({ log: (value: string) => record(value) });
record('retained-side-effect');
record(__NATIVE_SWC_RULE__);
