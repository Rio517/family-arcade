import '@testing-library/jest-dom/vitest';
import { beforeEach } from 'vitest';
import { resetProfileStore } from '@shared/profile/profileStore';

// The profile is a shared module-level store (see profileStore.ts). Re-sync it
// from localStorage before each test so a name/points change in one case can't
// leak into the next.
beforeEach(() => {
  resetProfileStore();
});
