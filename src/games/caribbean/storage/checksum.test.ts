import { describe, expect, it } from 'vitest';

import { canonicalJson, checksumPayload, fnv1aUtf8 } from './checksum';

describe('fnv1aUtf8', () => {
  it.each([
    ['', '811c9dc5'],
    ['a', 'e40c292c'],
    ['hello', '4f9f2cab'],
    ['café', 'a82b5049'],
    ['😀', '33a29608'],
  ] as const)('hashes the literal UTF-8 vector %#', (value, expected) => {
    expect(fnv1aUtf8(value)).toBe(expected);
  });

  it('always emits exactly eight lowercase hexadecimal characters', () => {
    expect(fnv1aUtf8('\u0000')).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe('canonicalJson', () => {
  it('sorts every plain-object key while preserving array order', () => {
    expect(canonicalJson({
      z: 3,
      nested: { d: 4, c: 3 },
      list: [{ b: 2, a: 1 }, 3, 2, 1],
      a: true,
    })).toBe('{"a":true,"list":[{"a":1,"b":2},3,2,1],"nested":{"c":3,"d":4},"z":3}');
  });

  it('gives insertion-order variants the same checksum but remains payload-byte sensitive', () => {
    const first = { captain: { name: 'Morgan', talent: 'navigation' }, events: [1, 2] };
    const reordered = { events: [1, 2], captain: { talent: 'navigation', name: 'Morgan' } };

    expect(checksumPayload(first)).toBe(checksumPayload(reordered));
    expect(checksumPayload({ ...first, events: [2, 1] })).not.toBe(checksumPayload(first));
    expect(checksumPayload({ ...first, captain: { ...first.captain, name: 'morgan' } })).not.toBe(checksumPayload(first));
  });

  it.each([
    ['undefined', undefined],
    ['bigint', 1n],
    ['function', () => undefined],
    ['symbol', Symbol('value')],
    ['NaN', Number.NaN],
    ['infinity', Number.POSITIVE_INFINITY],
    ['date', new Date(0)],
    ['map', new Map()],
    ['sparse array', Array(1)],
  ] as const)('rejects the non-JSON %s value', (_label, value) => {
    expect(() => canonicalJson(value)).toThrowError('Cannot canonicalize non-JSON value');
  });

  it('rejects cycles, symbol keys, array expandos, and accessors without invoking them', () => {
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    expect(() => canonicalJson(cycle)).toThrowError('Cannot canonicalize non-JSON value');

    const symbolKeyed = { value: true } as Record<PropertyKey, unknown>;
    symbolKeyed[Symbol('hidden')] = true;
    expect(() => canonicalJson(symbolKeyed)).toThrowError('Cannot canonicalize non-JSON value');

    const expanded = [1] as unknown[] & Record<string, unknown>;
    expanded.note = true;
    expect(() => canonicalJson(expanded)).toThrowError('Cannot canonicalize non-JSON value');

    let getterReads = 0;
    const accessor = {};
    Object.defineProperty(accessor, 'value', {
      enumerable: true,
      get: () => {
        getterReads += 1;
        return true;
      },
    });
    expect(() => canonicalJson(accessor)).toThrowError('Cannot canonicalize non-JSON value');
    expect(getterReads).toBe(0);
  });
});
