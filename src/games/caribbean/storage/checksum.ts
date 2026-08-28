import { canonicalJson } from '../canonicalJson';

export { canonicalJson } from '../canonicalJson';

const FNV_OFFSET_BASIS = 0x811c_9dc5;
const FNV_PRIME = 0x0100_0193;

export function fnv1aUtf8(value: string): string {
  let hash = FNV_OFFSET_BASIS;
  for (const byte of new TextEncoder().encode(value)) {
    hash = Math.imul(hash ^ byte, FNV_PRIME) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export function checksumPayload(payload: unknown): string {
  return fnv1aUtf8(canonicalJson(payload));
}
