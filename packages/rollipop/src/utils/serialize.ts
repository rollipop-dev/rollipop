export function serialize(value: unknown) {
  return JSON.stringify(value, (_, value) => {
    if (typeof value === 'function') {
      return value.toString();
    }
    if (value instanceof RegExp) {
      return value.toString();
    }
    return value;
  });
}

export function toJsonSafe(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value == null) {
    return value;
  }

  switch (typeof value) {
    case 'string':
    case 'number':
    case 'boolean':
      return value;

    case 'bigint':
    case 'symbol':
      return String(value);

    case 'function':
      return `[Function ${value.name || 'anonymous'}]`;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }

  if (seen.has(value)) {
    return '[Circular]';
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => toJsonSafe(item, seen));
  }

  if (value instanceof Map) {
    return Object.fromEntries(
      Array.from(value.entries()).map(([key, item]) => [String(key), toJsonSafe(item, seen)]),
    );
  }

  if (value instanceof Set) {
    return Array.from(value.values()).map((item) => toJsonSafe(item, seen));
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, toJsonSafe(item, seen)]),
  );
}
