const CANONICAL_ERROR = 'Cannot canonicalize non-JSON value';

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function canonicalValue(value: unknown, ancestors: Set<object>): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(CANONICAL_ERROR);
    return JSON.stringify(value);
  }
  if (typeof value !== 'object') throw new Error(CANONICAL_ERROR);
  if (!Array.isArray(value) && !isPlainRecord(value)) throw new Error(CANONICAL_ERROR);
  if (ancestors.has(value)) throw new Error(CANONICAL_ERROR);

  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => typeof key === 'symbol')) throw new Error(CANONICAL_ERROR);

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
      if (
        !lengthDescriptor
        || !('value' in lengthDescriptor)
        || !Number.isInteger(lengthDescriptor.value)
        || lengthDescriptor.value < 0
      ) {
        throw new Error(CANONICAL_ERROR);
      }
      const length = lengthDescriptor.value;
      const allowedKeys = new Set([
        'length',
        ...Array.from({ length }, (_, index) => String(index)),
      ]);
      if (ownKeys.some((key) => typeof key === 'string' && !allowedKeys.has(key))) {
        throw new Error(CANONICAL_ERROR);
      }

      const items: string[] = [];
      for (let index = 0; index < length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor || !('value' in descriptor) || descriptor.enumerable !== true) {
          throw new Error(CANONICAL_ERROR);
        }
        items.push(canonicalValue(descriptor.value, ancestors));
      }
      return `[${items.join(',')}]`;
    }

    const entries: string[] = [];
    for (const key of ownKeys.filter((candidate): candidate is string => typeof candidate === 'string').sort()) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !('value' in descriptor) || descriptor.enumerable !== true) {
        throw new Error(CANONICAL_ERROR);
      }
      entries.push(`${JSON.stringify(key)}:${canonicalValue(descriptor.value, ancestors)}`);
    }
    return `{${entries.join(',')}}`;
  } finally {
    ancestors.delete(value);
  }
}

export function canonicalJson(value: unknown): string {
  try {
    return canonicalValue(value, new Set());
  } catch {
    throw new Error(CANONICAL_ERROR);
  }
}
