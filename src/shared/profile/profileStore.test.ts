import { beforeEach, describe, expect, it } from 'vitest';
import {
  getProfileSnapshot,
  loadProfile,
  resetProfileStore,
  saveProfile,
  setProfileState,
  subscribeProfile,
} from './profileStore';
import { defaultProfile } from './profile';

beforeEach(() => {
  localStorage.clear();
  resetProfileStore();
});

describe('profile persistence', () => {
  it('round-trips a profile', () => {
    const p = { ...defaultProfile(), name: 'Rio', points: 350 };
    saveProfile(p);
    expect(loadProfile()).toEqual(p);
  });

  it('returns a default profile when nothing is stored', () => {
    expect(loadProfile()).toEqual(defaultProfile());
  });

  it('recovers from corrupt JSON', () => {
    localStorage.setItem('bship:profile:v1', '{not json');
    expect(loadProfile()).toEqual(defaultProfile());
  });
});

describe('shared profile store', () => {
  it('notifies subscribers on change, persists, and stops after unsubscribe', () => {
    let hits = 0;
    const unsub = subscribeProfile(() => hits++);

    setProfileState({ ...getProfileSnapshot(), points: 999 });
    expect(hits).toBe(1);
    expect(getProfileSnapshot().points).toBe(999);
    expect(loadProfile().points).toBe(999); // written through to storage

    setProfileState(getProfileSnapshot()); // same reference — no-op, no notify
    expect(hits).toBe(1);

    unsub();
    setProfileState({ ...getProfileSnapshot(), points: 5 });
    expect(hits).toBe(1); // no longer listening
    expect(getProfileSnapshot().points).toBe(5);
  });
});
