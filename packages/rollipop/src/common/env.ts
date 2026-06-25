const DEBUG_KEY = 'rollipop';
const TRUTHY_VALUES = ['yes', 'on', 'true', 'enabled'];
const FALSY_VALUES = ['no', 'off', 'false', 'disabled'];

export function parseDebugKeys() {
  return Object.keys(process.env)
    .filter((key) => /^debug_/i.test(key))
    .reduce(
      (acc, key) => {
        const prop = key
          .slice(6)
          .toLowerCase()
          .replace(/_([a-z])/g, (_, key) => key.toUpperCase());

        let value: any = process.env[key];
        const lowerCase = typeof value === 'string' ? value.toLowerCase() : value.toString();
        if (TRUTHY_VALUES.includes(lowerCase)) {
          value = true;
        } else if (FALSY_VALUES.includes(lowerCase)) {
          value = false;
        } else {
          value = Boolean(Number(value));
        }
        acc[prop] = value;
        return acc;
      },
      {} as Record<string, boolean>,
    );
}

let debugKeys: Record<string, boolean> | null = null;

export function isDebugEnabled() {
  if (debugKeys == null) {
    debugKeys = parseDebugKeys();
  }
  return debugKeys[DEBUG_KEY] ?? false;
}
