import '@testing-library/jest-dom/vitest';
import { beforeEach } from 'vitest';
import { resetProfileStore } from '@shared/profile/profileStore';

// MapLibre prepares its worker URL while the game registry is imported. jsdom
// does not implement object URLs, even in shell tests that never mount a map.
if (typeof window.URL.createObjectURL !== 'function') {
  Object.defineProperty(window.URL, 'createObjectURL', {
    configurable: true,
    value: () => 'blob:vitest-maplibre-worker',
  });
}
if (typeof window.URL.revokeObjectURL !== 'function') {
  Object.defineProperty(window.URL, 'revokeObjectURL', {
    configurable: true,
    value: () => undefined,
  });
}

// The profile is a shared module-level store (see profileStore.ts). Re-sync it
// from localStorage before each test so a name/points change in one case can't
// leak into the next.
beforeEach(() => {
  resetProfileStore();
});
