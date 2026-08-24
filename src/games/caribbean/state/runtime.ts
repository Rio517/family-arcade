import type { StorageLike } from '../storage/persistence';
import {
  createCampaignWriter,
  type CampaignWriter,
  type LockManagerLike,
} from '../storage/writer';

export interface CaribbeanRuntime {
  storage: StorageLike;
  storageCapability:
    | { kind: 'available' }
    | { kind: 'unavailable'; error: unknown };
  writer: CampaignWriter;
  build: string;
  now(): number;
  makeSeed(): number;
  makeQuarantineId(): string;
}

let browserRuntime: CaribbeanRuntime | null = null;

function unavailableStorage(error: unknown): StorageLike {
  const fail = (): never => { throw error; };
  return {
    getItem: fail,
    setItem: fail,
    removeItem: fail,
  };
}

function createBrowserRuntime(): CaribbeanRuntime {
  let storage: StorageLike;
  let storageCapability: CaribbeanRuntime['storageCapability'];
  try {
    storage = window.localStorage;
    storageCapability = { kind: 'available' };
  } catch (error) {
    storage = unavailableStorage(error);
    storageCapability = { kind: 'unavailable', error };
  }

  const locks = typeof navigator !== 'undefined' && 'locks' in navigator
    ? navigator.locks as unknown as LockManagerLike
    : null;

  return {
    storage,
    storageCapability,
    writer: createCampaignWriter(locks),
    build: 'caribbean-sailing-1',
    now: () => Date.now(),
    makeSeed: () => crypto.getRandomValues(new Uint32Array(1))[0],
    makeQuarantineId: () => crypto.randomUUID(),
  };
}

export function getBrowserCaribbeanRuntime(): CaribbeanRuntime {
  browserRuntime ??= createBrowserRuntime();
  return browserRuntime;
}
